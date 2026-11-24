-- ============================================================
-- MIGRACIÓN 0002 — DAENERYS: configuración administrativa,
-- métodos de pago múltiples, pedidos web y comprobantes
--
-- Proyecto: Daenerys (sistemaa-IA)
--
-- IDEMPOTENTE: se puede ejecutar completa más de una vez sin
-- romper datos existentes (if not exists / create or replace /
-- drops condicionales).
--
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1. store_settings: información completa del negocio y tienda
-- ------------------------------------------------------------
alter table public.store_settings add column if not exists business_description text;
alter table public.store_settings add column if not exists business_hours text;
alter table public.store_settings add column if not exists business_email text;
alter table public.store_settings add column if not exists social_facebook text;
alter table public.store_settings add column if not exists social_instagram text;
alter table public.store_settings add column if not exists social_tiktok text;
alter table public.store_settings add column if not exists banner_url text;
alter table public.store_settings add column if not exists announcement text;

-- ------------------------------------------------------------
-- 2. payment_methods: cuentas bancarias / métodos de cobro.
--    El admin puede registrar varias cuentas de transferencia.
--    NUNCA se guarda CVV, NIP ni contraseñas bancarias.
-- ------------------------------------------------------------
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- etiqueta visible, ej. "BBVA · Cuenta principal"
  kind text not null default 'transfer'
    check (kind in ('transfer','card','other')),
  bank_name text,
  holder_name text,                            -- titular de la cuenta
  clabe text,                                  -- CLABE interbancaria (18 dígitos)
  account_number text,
  card_number text,                            -- número de tarjeta cuando corresponda
  instructions text,                           -- instrucciones para el cliente
  image_url text,                              -- imagen/comprobante de referencia
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

create index if not exists idx_payment_methods_active
  on public.payment_methods(active, sort_order);

-- ------------------------------------------------------------
-- 3. products.featured: productos destacados en la tienda
-- ------------------------------------------------------------
alter table public.products add column if not exists featured boolean not null default false;
create index if not exists idx_products_featured on public.products(featured) where featured;

-- ------------------------------------------------------------
-- 4. orders.payment_status: agregar 'review' (pago en revisión,
--    p. ej. cuando el cliente adjunta comprobante de transferencia)
-- ------------------------------------------------------------
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

alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('pending','review','paid','rejected','cancelled','refunded'));

-- ------------------------------------------------------------
-- 4b. orders.order_number: la BD original lo creó como
--     bigint IDENTITY; el formato del sistema es texto 'D-XXXXXX'.
--     Se convierte de forma idempotente y se rellenan los
--     pedidos existentes con su folio legible.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'order_number' and data_type = 'bigint'
  ) then
    alter table public.orders alter column order_number drop identity if exists;
    alter table public.orders alter column order_number drop default;
    alter table public.orders alter column order_number type text
      using order_number::text;
  end if;
end $$;

-- Reasignar folio legible a pedidos que no lo tengan
update public.orders
set order_number = case
    when payment_reference ~ '^D-[0-9A-Fa-f]{6}$' then upper(payment_reference)
    else 'D-' || upper(substr(replace(id::text, '-', ''), 1, 6))
  end
where order_number is null or order_number !~ '^D-[0-9A-Fa-f]{6}$';

-- Trigger que genera el folio en INSERTs futuros (por si la migración
-- 0001 no se aplicó completa en esta base de datos).
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
-- 5. Supabase Storage: imágenes de productos y comprobantes
--    - product-images: lectura pública; escritura solo staff
--      (el upload lo hace el panel ya autenticado).
--    - payment-proofs: lectura pública (el admin abre el enlace);
--      escritura permitida a autenticados y a invitados (anon)
--      porque el cliente puede subir su comprobante sin cuenta.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880,
   array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']),
  ('payment-proofs', 'payment-proofs', true, 8388608,
   array['image/png','image/jpeg','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

-- Lectura pública ya la da el bucket público; aquí solo controlamos
-- la escritura. Las políticas son idempotentes.
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
