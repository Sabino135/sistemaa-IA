# SISTEMA IA — POS y Administración

Sistema integral de administración y punto de venta para negocio de hamburguesas y burritos.

- **Frontend:** Svelte 4 + Vite (SPA)
- **Backend:** Node.js + Express (API REST)
- **Base de datos:** Supabase (PostgreSQL)
- **Deploy:** Vercel (monorepo)

## Estructura

```
├── api/index.js          # Serverless function de Vercel → Express
├── backend/              # API REST (Express + Supabase + JWT + bcrypt)
│   └── src/
│       ├── app.js        # Configuración Express (helmet, CORS, rate limit, balanceador)
│       ├── middleware/   # auth (JWT), loadBalancer (concurrencia), rate limit
│       └── routes/       # auth, CRUDs, inventory, sales (POS), reports
├── frontend/             # SPA Svelte + Vite
│   └── src/pages/        # Login, Dashboard, POS, Productos, Inventario, Ventas,
│                         # Clientes, Gastos, Reportes, Usuarios, Geocercas
└── supabase/schema.sql   # Tablas y relaciones de la base de datos
```

## Puesta en marcha

### 1. Base de datos
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, ejecuta `supabase/schema.sql`.
3. Copia `Project URL`, `anon key` y `service_role key` (Settings → API).

### 2. Variables de entorno
Copia `.env.example` a `backend/.env` (desarrollo local) y configura las variables en Vercel:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
JWT_SECRET=...        # cadena larga y aleatoria
BCRYPT_ROUNDS=12
```

### 3. Seed (datos iniciales)
```bash
npm install
node backend/scripts/seed.js
```
Crea el usuario admin (`admin@negocio.com` / `admin123` — **cámbialo**) y datos de ejemplo: categorías, ingredientes, productos y recetas.

### 4. Desarrollo local
```bash
npm run dev:backend   # API en http://localhost:3000/api
npm run dev:frontend  # App en http://localhost:5173 (proxy /api → :3000)
```

### 5. Deploy en Vercel
1. Importa el repositorio en Vercel (detecta `vercel.json` en la raíz).
2. Configura las variables de entorno del backend en el proyecto.
3. `vercel.json` compila el frontend (`frontend/dist`) y expone el backend como función en `/api/*`.

## Autenticación

La autenticación la maneja **Supabase Auth** (Google OAuth + email/password):

1. En Supabase → **Authentication → Providers**: habilita **Google** y configura las credenciales OAuth.
2. En **Authentication → URL Configuration** agrega los redirect URLs:
   - `http://localhost:5173/` (desarrollo)
   - `https://tu-dominio.vercel.app/` (producción)
3. El frontend inicia sesión con `signInWithOAuth` / `signInWithPassword` / `signUp`.
4. El backend verifica el access token con `supabase.auth.getUser()` y hace upsert del perfil en `public.users` (rol `cajero` por defecto; cámbialo a `admin` en la tabla `users`).

## Funcionalidades

- **POS:** catálogo por categorías, ticket, pagos (efectivo/tarjeta/transferencia), cálculo, cambio.
- **Inventario automático:** cada venta descuenta ingredientes según las recetas; cancelación reintegra stock; alertas de stock mínimo; movimientos auditables; ajustes manuales.
- **Reportes:** ventas del día/mes, gastos, utilidad, margen, valor del inventario, productos más vendidos.
- **Geocercas:** dibujo de círculos y polígonos, guardado en Supabase, seguimiento de ubicación y registro de entradas/salidas por usuario.
- **Seguridad:** Supabase Auth (OAuth Google + email/password), JWT verificado en backend, Helmet, CORS, rate limiting y balanceador de cargas por concurrencia.
- **Roles:** admin, cajero, inventario.

## Notas

- El IVA del 16% está fijo en `backend/src/routes/sales.js`; ajústalo si aplica otro régimen.
- Para producción cambia `JWT_SECRET`, la contraseña admin y revisa las políticas RLS de Supabase (el backend usa `service_role`, que bypasea RLS).
