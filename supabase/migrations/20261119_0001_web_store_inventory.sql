-- ============================================================
-- MIGRACIÓN 0001 — Tienda web, pedidos, ajustes manuales e inventario
-- Proyecto: Daenerys (sistemaa-IA)
--
-- Sincroniza la base de datos con el código real del backend.
-- Es IDEMPOTENTE: se puede ejecutar completa más de una vez
-- sin romper datos existentes (create table/column if not exists,
-- create or replace function, drop trigger if exists, etc.).
--
-- Ejecutar en: Supabase → SQL Editor
-- NO contiene datos de prueba ni elimina información.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tablas nuevas: tienda online y pedidos web
-- ------------------------------------------------------------

-- Configuración de la tienda (fila única id = 1)
create table if not exists public.store_settings (
  id integer primary key,
  store_name text not null default 'Daenerys',
  store_tagline text,
  logo_url text,
  phone text,
  whatsapp text,
  address text,
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  delivery_fee numeric(10,2) not null default 0,
  delivery_zones jsonb,
  bank_name text,
  bank_account_name text,
  bank_clabe text,
  bank_account_number text,
  transfer_instructions text,
  cash_enabled boolean not null default true,
  transfer_enabled boolean not null default true,
  mercadopago_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id)
values (1)
on conflict (id) do nothing;

-- Zonas de entrega (polígonos con tarifa propia)
create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  geometry jsonb not null,               -- { points: [[lat,lng],...] }
  delivery_fee numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Pedidos web (canal tienda online)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text,                     -- 'D-XXXXXX' legible para el cliente
  user_id uuid references public.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_email text,
  delivery_method text not null default 'delivery'
    check (delivery_method in ('delivery','pickup')),
  delivery_address text,
  delivery_notes text,
  payment_method text not null
    check (payment_method in ('mercadopago','transfer','cash')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','rejected','cancelled','refunded')),
  status text not null default 'received'
    check (status in ('received','preparing','ready','on_the_way','delivered','cancelled')),
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  notes text,
  payment_reference text,                -- 'D-XXXX' → luego id/preferencia de MP
  payment_proof_url text,
  guest_token uuid not null default gen_random_uuid(), -- acceso del invitado
  sale_id uuid references public.sales(id) on delete set null, -- venta POS generada al entregar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text,
  unit_price numeric(10,2) not null default 0,
  quantity numeric not null check (quantity > 0),
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Columnas nuevas en tablas existentes
-- ------------------------------------------------------------

-- sales: idempotencia POS, canal de origen y vínculo con pedido web
alter table public.sales add column if not exists client_ref text;
alter table public.sales add column if not exists source text not null default 'pos';
alter table public.sales add column if not exists order_id uuid references public.orders(id) on delete set null;
alter table public.sales add column if not exists allow_negative_stock boolean not null default false;

-- products: costo para reportes de utilidad y bandera de control de inventario
alter table public.products add column if not exists cost numeric(10,2) not null default 0;
alter table public.products add column if not exists track_inventory boolean;

-- expenses: URL del comprobante/foto
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'receipt_url'
  ) then
    alter table public.expenses add column receipt_url text;
  end if;
end $$;

-- track_inventory: activar control solo en productos CON receta,
-- para no dejar invendibles los productos existentes sin receta.
update public.products p
set track_inventory = true
where p.track_inventory is null
  and exists (select 1 from public.recipes r where r.product_id = p.id);

update public.products p
set track_inventory = false
where p.track_inventory is null;

alter table public.products alter column track_inventory set default true;
alter table public.products alter column track_inventory set not null;

-- users.role: permitir 'cliente' (compradores de la tienda online).
-- Se reemplaza cualquier CHECK existente sobre la columna role.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.users'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.users drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role in ('admin','cajero','inventario','cliente','usuario'));

-- ------------------------------------------------------------
-- 3. Índices y unicidad
-- ------------------------------------------------------------

create unique index if not exists sales_client_ref_key
  on public.sales(client_ref) where client_ref is not null;

create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_orders_customer on public.orders(customer_id);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_delivery_zones_active on public.delivery_zones(active);
create index if not exists idx_sales_order on public.sales(order_id);

-- order_number legible: copia payment_reference si ya trae 'D-XXXXXX',
-- si no genera uno nuevo. Se asigna antes del INSERT.
create or replace function public.orders_set_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    if new.payment_reference ~ '^D-[0-9A-Fa-f]{6}$' then
      new.order_number := upper(new.payment_reference);
    else
      new.order_number := 'D-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_order_number on public.orders;
create trigger trg_orders_order_number
  before insert on public.orders
  for each row execute function public.orders_set_order_number();

-- ------------------------------------------------------------
-- 4. Funciones RPC de inventario (descuento y reintegro atómicos)
--    Son las que llaman sales.js y orders.js vía supabase.rpc().
-- ------------------------------------------------------------

-- deduct_sale_stock: descuenta ingredientes según recetas de los items
-- de una venta. ATÓMICO: cualquier fallo revierte todo el descuento.
-- p_allow_negative = true permite dejar stock en negativo (solo admin).
create or replace function public.deduct_sale_stock(
  p_sale_id uuid,
  p_allow_negative boolean default false,
  p_user_id uuid default null
)
returns void language plpgsql as $$
declare
  need record;
  v_stock numeric;
begin
  -- Productos con control de inventario deben tener receta
  -- (si no, no hay forma de saber cuántas unidades se pueden preparar)
  for need in
    select distinct si.product_id
    from public.sale_items si
    join public.products p on p.id = si.product_id
    where si.sale_id = p_sale_id
      and p.track_inventory
  loop
    if not exists (select 1 from public.recipes r where r.product_id = need.product_id) then
      if not p_allow_negative then
        raise exception 'insufficient_stock: producto % sin receta', need.product_id;
      end if;
    end if;
  end loop;

  -- Necesidad TOTAL por ingrediente (suma de todas las líneas del ticket,
  -- para que dos productos que comparten ingrediente no se validen por separado)
  for need in
    select r.ingredient_id, sum(r.quantity * si.quantity) as qty
    from public.sale_items si
    join public.products p on p.id = si.product_id and p.track_inventory
    join public.recipes r on r.product_id = si.product_id
    where si.sale_id = p_sale_id
    group by r.ingredient_id
  loop
    select stock into v_stock
    from public.ingredients
    where id = need.ingredient_id
    for update;  -- bloqueo de fila: evita carreras entre ventas simultáneas

    if v_stock is null then continue; end if;

    if not p_allow_negative and v_stock < need.qty then
      raise exception 'insufficient_stock: ingrediente %', need.ingredient_id;
    end if;

    update public.ingredients
    set stock = stock - need.qty
    where id = need.ingredient_id;

    insert into public.inventory_movements
      (ingredient_id, quantity, type, reason, reference_id, user_id)
    values
      (need.ingredient_id, -need.qty, 'sale', 'Venta ' || p_sale_id::text, p_sale_id, p_user_id);
  end loop;
end $$;

-- restock_sale: reintegra ingredientes al cancelar una venta.
-- Idempotente: si ya se registró el reintegro, no hace nada dos veces.
create or replace function public.restock_sale(
  p_sale_id uuid,
  p_user_id uuid default null
)
returns void language plpgsql as $$
declare
  m record;
begin
  if exists (
    select 1 from public.inventory_movements
    where reference_id = p_sale_id
      and type = 'adjustment'
      and reason like 'Reintegro venta%'
  ) then
    return;
  end if;

  for m in
    select ingredient_id, sum(-quantity) as qty
    from public.inventory_movements
    where reference_id = p_sale_id
      and type = 'sale'
    group by ingredient_id
  loop
    update public.ingredients
    set stock = stock + m.qty
    where id = m.ingredient_id;

    insert into public.inventory_movements
      (ingredient_id, quantity, type, reason, reference_id, user_id)
    values
      (m.ingredient_id, m.qty, 'adjustment', 'Reintegro venta ' || p_sale_id::text, p_sale_id, p_user_id);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Row Level Security (mismo criterio que schema.sql:
--    RLS activo sin políticas; solo el backend con service_role
--    accede a los datos)
-- ------------------------------------------------------------

alter table public.store_settings enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
