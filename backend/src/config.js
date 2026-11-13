const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); // .env raíz
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true }); // backend/.env tiene prioridad

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const required = ['SUPABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[env] Falta la variable de entorno requerida: ${key}`);
    process.exit(1);
  }
}
if (!serviceRoleKey) {
  console.error('[env] Falta la variable de entorno requerida: SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function jwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString());
  } catch {
    return null;
  }
}

const serviceRole = jwtPayload(serviceRoleKey)?.role;
const isPublishableKey = serviceRoleKey.startsWith('sb_publishable_')
  || serviceRoleKey === process.env.SUPABASE_ANON_KEY
  || serviceRoleKey === process.env.VITE_SUPABASE_ANON_KEY;
if (isPublishableKey || (serviceRole && serviceRole !== 'service_role')) {
  console.error('[env] SUPABASE_SERVICE_ROLE_KEY debe ser la service_role/secret key de Supabase, no la anon/publishable key.');
  process.exit(1);
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey,
    anonKey: process.env.SUPABASE_ANON_KEY
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10)
  },
  load: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '50', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '300', 10)
  }
};
