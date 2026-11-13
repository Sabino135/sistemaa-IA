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
