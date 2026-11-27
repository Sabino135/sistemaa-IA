-- ============================================================
-- SISTEMA IA - POS / Administración
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

create extension if not exists "pgcrypto";

-- Perfiles de usuario. La autenticación (email/password y Google OAuth)
-- la maneja Supabase Auth (auth.users); aquí solo va el perfil operativo.
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'cajero' check (role in ('admin','cajero','inventario')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Categorías de producto
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ingredientes / inventario
create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'pz',
  stock numeric not null default 0,
  min_stock numeric,
  cost_per_unit numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Productos (hamburguesas, burritos, etc.)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price numeric(10,2) check (price is null or price >= 0), -- NULL = pendiente de configurar
  category_id uuid references categories(id) on delete set null,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Recetas: ingrediente necesario por unidad de producto
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (product_id, ingredient_id)
);

-- Clientes
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text,
  email text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ventas
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  user_id uuid references users(id),
  subtotal numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash','card','transfer')),
  amount_received numeric(10,2),
  change_given numeric(10,2),
  status text not null default 'completed' check (status in ('completed','cancelled','pending')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id),
  quantity numeric not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  total numeric(10,2) not null
);

-- Movimientos de inventario (compras, ventas, ajustes)
create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id),
  quantity numeric not null,
  type text not null check (type in ('purchase','sale','adjustment','waste')),
  reason text,
  reference_id uuid,
  user_id uuid references users(id),
  created_at timestamptz not null default now()
);

-- Categorías de gasto
create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Gastos
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(10,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  category_id uuid references expense_categories(id) on delete set null,
  payment_method text default 'cash',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Geocercas (círculos o polígonos dibujados en el mapa)
create table if not exists geofences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('circle','polygon')),
  geometry jsonb not null, -- circle: {center:[lat,lng],radius_m} | polygon: {points:[[lat,lng],...]}
  color text not null default '#f97316',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Historial de entradas y salidas por usuario y geocerca
create table if not exists geofence_events (
  id uuid primary key default gen_random_uuid(),
  geofence_id uuid not null references geofences(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  event_type text not null check (event_type in ('enter','exit')),
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  accuracy_m numeric,
  created_at timestamptz not null default now()
);

-- Índices para consultas frecuentes
create index if not exists idx_sales_created_at on sales(created_at);
create index if not exists idx_sales_status on sales(status);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_inventory_movements_ing on inventory_movements(ingredient_id);
create index if not exists idx_expenses_date on expenses(expense_date);
create index if not exists idx_geofence_events_geofence on geofence_events(geofence_id, created_at desc);
create index if not exists idx_geofence_events_user on geofence_events(user_id, created_at desc);
create index if not exists idx_geofence_events_created_at on geofence_events(created_at desc);

-- ============================================================
-- Row Level Security
-- El frontend nunca consulta tablas directamente (usa el backend
-- con service_role, que omite RLS). Se habilita RLS sin políticas
-- para que anon/authenticated no tengan acceso directo a los datos.
-- ============================================================
alter table users enable row level security;
alter table categories enable row level security;
alter table ingredients enable row level security;
alter table products enable row level security;
alter table recipes enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table inventory_movements enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table geofences enable row level security;
alter table geofence_events enable row level security;

-- ============================================================
-- Ajustes para bases de datos ya existentes
-- (create table if not exists no modifica tablas previas;
-- estos ALTER son idempotentes y corrigen el esquema anterior)
-- ============================================================
alter table products alter column price drop not null;

-- La autenticación migró a Supabase Auth: la columna password_hash
-- (del sistema bcrypt anterior) ya no se usa y rompía el INSERT
-- de GET /api/auth/me con error 23502 (NOT NULL violation).
alter table users drop column if exists password_hash;

-- ============================================================
-- TIENDA ONLINE (Daenerys)
-- Los pedidos web viven en tablas propias (orders/order_items) y NO se
-- mezclan con `sales` (que sigue siendo el POS presencial). Un pedido web
-- puede convertirse luego en venta desde el panel, pero eso es opcional.
-- ============================================================

-- El rol del perfil operativo ahora admite "cliente" (compradores de la
-- tienda que se registran). Los clientes web NO deben ver el panel admin.
-- Se recrea el CHECK de forma idempotente.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin','cajero','inventario','cliente'));

-- Configuración de la tienda: fila única (id fijo = 1).
create table if not exists store_settings (
  id integer primary key default 1 check (id = 1),
  store_name text not null default 'Daenerys',
  store_tagline text not null default 'Hamburguesas · Burritos · Carne asada',
  logo_url text,
  phone text,
  whatsapp text,
  address text,
  -- Entrega
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  delivery_zones text,                        -- texto libre / lista simple
  -- Datos bancarios para transferencia
  bank_name text,
  bank_account_name text,
  bank_clabe text,
  bank_account_number text,
  transfer_instructions text,
  -- Interruptores de métodos de pago
  cash_enabled boolean not null default true,
  transfer_enabled boolean not null default true,
  mercadopago_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Pedidos de la tienda online.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  -- Número legible 'D-XXXXXX' (lo genera el trigger orders_set_order_number)
  order_number text,
  -- Cliente: puede ser invitado (user_id/customer_id null) con datos capturados
  user_id uuid references users(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  -- Entrega
  delivery_method text not null check (delivery_method in ('delivery','pickup')),
  delivery_address text,
  delivery_notes text,
  -- Pago: estado SEPARADO del estado del pedido
  payment_method text not null check (payment_method in ('mercadopago','transfer','cash')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','rejected','cancelled','refunded')),
  payment_reference text,                     -- preferencia/pago de Mercado Pago
  payment_proof_url text,                     -- comprobante de transferencia
  -- Estado del pedido
  status text not null default 'received'
    check (status in ('received','preparing','ready','on_the_way','delivered','cancelled')),
  -- Importes
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  notes text,
  -- Token para que un invitado consulte su pedido sin cuenta
  guest_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  unit_price numeric(10,2) not null default 0,
  quantity integer not null check (quantity > 0),
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_created_at on orders(created_at desc);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_payment_status on orders(payment_status);
create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_order_items_order on order_items(order_id);

-- RLS: mismo modelo que el resto del sistema. El backend usa service_role
-- (omite RLS); anon/authenticated no acceden directamente a estas tablas.
alter table store_settings enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Fila única de configuración (el backend la crea/actualiza; aquí aseguramos
-- que exista una por defecto sin sobrescribir valores ya configurados).
insert into store_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- INTEGRACIÓN POS ↔ TIENDA WEB + MEJORAS (Fase 2)
-- Todo idempotente: seguro ejecutar sobre bases existentes.
-- ============================================================

-- Ventas: idempotencia de caja (evita duplicados por doble submit)
alter table sales add column if not exists client_ref text;
create unique index if not exists idx_sales_client_ref on sales(client_ref) where client_ref is not null;

-- Trazabilidad: si la venta descontó stock en negativo por autorización admin
alter table sales add column if not exists allow_negative_stock boolean not null default false;

-- Enlace pedido web -> venta POS generada al entregarse
alter table sales add column if not exists order_id uuid references orders(id) on delete set null;
alter table orders add column if not exists sale_id uuid references sales(id) on delete set null;
create index if not exists idx_orders_sale on orders(sale_id);

-- Costo del producto (para utilidad real en reportes)
alter table products add column if not exists cost numeric(10,2) not null default 0 check (cost >= 0);

-- Comprobante de gasto
alter table expenses add column if not exists receipt_url text;

-- Categoría/condición de pedido web para distinguir canal en reportes
alter table sales add column if not exists source text not null default 'pos' check (source in ('pos','web'));

-- ------------------------------------------------------------
-- Zonas de entrega: polígonos geográficos con tarifa propia.
-- Distinto de `geofences` (que es para tracking de empleados).
-- ------------------------------------------------------------
create table if not exists delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  geometry jsonb not null,           -- { points: [[lat,lng],...] } (polígono)
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table delivery_zones enable row level security;

-- ------------------------------------------------------------
-- Descuento atómico de inventario por venta.
-- Ejecuta en UNA transacción: verifica stock (SELECT ... FOR UPDATE),
-- descuenta y registra movimientos. Si falta stock lanza excepción y
-- no queda ningún cambio parcial. p_allow_negative solo lo activa el
-- backend cuando un admin lo autorizó expresamente.
-- ------------------------------------------------------------
create or replace function deduct_sale_stock(
  p_sale_id uuid,
  p_allow_negative boolean default false,
  p_user_id uuid default null
)
returns void
language plpgsql
as $$
declare
  r record;
  v_stock numeric;
  v_name text;
  v_sale_user uuid;
begin
  select user_id into v_sale_user from sales where id = p_sale_id;
  if v_sale_user is null then
    raise exception 'sale_not_found';
  end if;

  for r in
    select ri.ingredient_id,
           sum(ri.quantity * si.quantity) as needed
    from sale_items si
    join recipes ri on ri.product_id = si.product_id
    where si.sale_id = p_sale_id
    group by ri.ingredient_id
  loop
    select stock, name into v_stock, v_name
    from ingredients where id = r.ingredient_id for update;
    if not found then
      continue;
    end if;
    if v_stock - r.needed < 0 and not p_allow_negative then
      raise exception 'insufficient_stock:%:%', v_name, r.needed;
    end if;
    update ingredients set stock = stock - r.needed where id = r.ingredient_id;
    insert into inventory_movements (ingredient_id, quantity, type, reason, reference_id, user_id)
    values (r.ingredient_id, -r.needed, 'sale',
            'Venta #' || left(p_sale_id::text, 8), p_sale_id,
            coalesce(p_user_id, v_sale_user));
  end loop;
end;
$$;

-- Reintegro atómico de inventario al cancelar una venta
create or replace function restock_sale(p_sale_id uuid, p_user_id uuid default null)
returns void
language plpgsql
as $$
declare
  r record;
  v_sale_user uuid;
begin
  select user_id into v_sale_user from sales where id = p_sale_id;
  for r in
    select ri.ingredient_id,
           sum(ri.quantity * si.quantity) as qty
    from sale_items si
    join recipes ri on ri.product_id = si.product_id
    where si.sale_id = p_sale_id
    group by ri.ingredient_id
  loop
    update ingredients set stock = stock + r.qty where id = r.ingredient_id;
    insert into inventory_movements (ingredient_id, quantity, type, reason, reference_id, user_id)
    values (r.ingredient_id, r.qty, 'adjustment',
            'Cancelación venta #' || left(p_sale_id::text, 8), p_sale_id,
            coalesce(p_user_id, v_sale_user));
  end loop;
end;
$$;

-- Control de inventario por producto: si es true, el POS valida existencias
-- (vía receta) y bloquea la venta sin stock salvo override de admin.
-- Productos sin receta con track_inventory=true no se pueden vender.
alter table products add column if not exists track_inventory boolean not null default true;

-- ============================================================
-- DAENERYS — Configuración administrativa, métodos de pago,
-- comprobantes y productos destacados (ver migración 0002)
-- ============================================================

-- Información completa del negocio / tienda online
alter table store_settings add column if not exists business_description text;
alter table store_settings add column if not exists business_hours text;
alter table store_settings add column if not exists business_email text;
alter table store_settings add column if not exists social_facebook text;
alter table store_settings add column if not exists social_instagram text;
alter table store_settings add column if not exists social_tiktok text;
alter table store_settings add column if not exists banner_url text;
alter table store_settings add column if not exists announcement text;

-- Cuentas bancarias / métodos de cobro (varios, administrables).
-- NUNCA guardar CVV, NIP ni contraseñas bancarias.
create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'transfer' check (kind in ('transfer','card','other')),
  bank_name text,
  holder_name text,
  clabe text,
  account_number text,
  card_number text,
  instructions text,
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table payment_methods enable row level security;

-- Productos destacados en la tienda online
alter table products add column if not exists featured boolean not null default false;

-- Supabase Storage: imágenes de productos y comprobantes.
-- - product-images: lectura pública; escritura para usuarios autenticados.
-- - payment-proofs: lectura pública; escritura para autenticados e invitados.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880,
   array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']),
  ('payment-proofs', 'payment-proofs', true, 8388608,
   array['image/png','image/jpeg','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "product-images staff insert" on storage.objects;
drop policy if exists "product-images staff update" on storage.objects;
drop policy if exists "product-images staff delete" on storage.objects;
drop policy if exists "payment-proofs anyone insert" on storage.objects;

create policy "product-images staff insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images');

create policy "product-images staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product-images staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images');

create policy "payment-proofs anyone insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'payment-proofs');

-- Estado de pago "en revisión" (comprobante de transferencia adjuntado)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;
alter table orders drop constraint if exists orders_payment_status_check;
alter table orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending','review','paid','rejected','cancelled','refunded'));

-- order_number como folio legible 'D-XXXXXX' (la tabla original lo creó
-- bigint identity; se convierte y se crea el trigger generador)
alter table orders alter column order_number drop identity if exists;
alter table orders alter column order_number drop default;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'order_number' and data_type = 'bigint'
  ) then
    alter table orders alter column order_number type text using order_number::text;
  end if;
end $$;
update orders
set order_number = case
    when payment_reference ~ '^[A-Za-z]+-[0-9A-Fa-f]{6}$' then upper(payment_reference)
    else 'D-' || upper(substr(replace(id::text, '-', ''), 1, 6))
  end
where order_number is null or order_number !~ '^[A-Za-z]+-[0-9A-Fa-f]{6}$';
create or replace function orders_set_order_number()
returns trigger language plpgsql as $$
declare
  v_prefix text := 'D-';
begin
  if new.order_number is null then
    select coalesce(nullif(order_prefix, ''), 'D-') into v_prefix
      from store_settings where id = 1;
    v_prefix := coalesce(v_prefix, 'D-');
    if new.payment_reference ~ '^[A-Za-z]+-[0-9A-Fa-f]{6}$' then
      new.order_number := upper(new.payment_reference);
    else
      new.order_number := v_prefix || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_order_number on orders;
create trigger trg_orders_order_number
  before insert on orders
  for each row execute function orders_set_order_number();

-- ============================================================
-- MIGRACIÓN 0004 — Historial de pedidos, registro de actividad
-- administrativa y configuración general de la tienda.
-- ============================================================

create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  field text not null check (field in ('status','payment_status')),
  from_value text,
  to_value text not null,
  changed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table order_status_history enable row level security;
create index if not exists idx_order_history_order on order_status_history(order_id, created_at desc);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  user_email text,
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table activity_log enable row level security;
create index if not exists idx_activity_log_created on activity_log(created_at desc);
create index if not exists idx_activity_log_action on activity_log(action);

alter table store_settings add column if not exists cover_image_url text;
alter table store_settings add column if not exists theme_color text not null default '#f97316';
alter table store_settings add column if not exists store_open boolean not null default true;
alter table store_settings add column if not exists tax_rate numeric(5,4) not null default 0.16;
alter table store_settings add column if not exists currency text not null default 'MXN';
alter table store_settings add column if not exists timezone text not null default 'America/Mexico_City';
alter table store_settings add column if not exists order_prefix text not null default 'D-';
alter table store_settings add column if not exists prep_time_minutes integer not null default 20;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('store-assets', 'store-assets', true, 5242880,
   array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists "store-assets staff insert" on storage.objects;
drop policy if exists "store-assets staff update" on storage.objects;
drop policy if exists "store-assets staff delete" on storage.objects;

create policy "store-assets staff insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-assets');

create policy "store-assets staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'store-assets')
  with check (bucket_id = 'store-assets');

create policy "store-assets staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-assets');
