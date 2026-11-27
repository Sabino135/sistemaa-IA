-- ============================================================
-- MIGRACIÓN 0004 — Historial de pedidos, registro de actividad
-- administrativa y configuración general de la tienda.
-- IDEMPOTENTE: segura de ejecutar más de una vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Historial de cambios de pedidos web (estado y pago)
-- ------------------------------------------------------------
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  field text not null check (field in ('status','payment_status')),
  from_value text,
  to_value text not null,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.order_status_history enable row level security;
create index if not exists idx_order_history_order on public.order_status_history(order_id, created_at desc);

-- ------------------------------------------------------------
-- 2. Registro de actividad administrativa
-- ------------------------------------------------------------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  user_email text,
  action text not null,               -- p.ej. 'settings.update', 'order.status'
  entity text,                        -- p.ej. 'orders', 'users', 'store_settings'
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.activity_log enable row level security;
create index if not exists idx_activity_log_created on public.activity_log(created_at desc);
create index if not exists idx_activity_log_action on public.activity_log(action);

-- ------------------------------------------------------------
-- 3. Configuración general de la tienda / sistema
-- ------------------------------------------------------------
alter table public.store_settings add column if not exists cover_image_url text;
alter table public.store_settings add column if not exists theme_color text not null default '#f97316';
alter table public.store_settings add column if not exists store_open boolean not null default true;
alter table public.store_settings add column if not exists tax_rate numeric(5,4) not null default 0.16;
alter table public.store_settings add column if not exists currency text not null default 'MXN';
alter table public.store_settings add column if not exists timezone text not null default 'America/Mexico_City';
alter table public.store_settings add column if not exists order_prefix text not null default 'D-';
alter table public.store_settings add column if not exists prep_time_minutes integer not null default 20;

-- Bucket público para imágenes de la tienda (logo, portada, banners)
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

-- Folios con prefijo configurable (order_prefix en store_settings)
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
