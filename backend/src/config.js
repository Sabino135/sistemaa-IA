const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); // .env raíz
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true }); // backend/.env tiene prioridad

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
// No hacemos process.exit(1): en Vercel el backend corre como función
// serverless y un exit durante el arranque se traduce en errores 500 sin
// diagnóstico. Acumulamos los faltantes y la app responde 503 descriptivo.
const missingEnv = [];
for (const key of ['SUPABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`[env] Falta la variable de entorno requerida: ${key}`);
    missingEnv.push(key);
  }
}
if (!serviceRoleKey) {
  console.error('[env] Falta la variable de entorno requerida: SUPABASE_SERVICE_ROLE_KEY');
  missingEnv.push('SUPABASE_SERVICE_ROLE_KEY');
}

function jwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString());
  } catch {
    return null;
  }
}

const serviceRole = serviceRoleKey ? jwtPayload(serviceRoleKey)?.role : null;
const keyStr = serviceRoleKey || '';
const isPublishableKey = keyStr.startsWith('sb_publishable_')
  || (!!process.env.SUPABASE_ANON_KEY && keyStr === process.env.SUPABASE_ANON_KEY)
  || (!!process.env.VITE_SUPABASE_ANON_KEY && keyStr === process.env.VITE_SUPABASE_ANON_KEY);
const badServiceRole = serviceRole && serviceRole !== 'service_role';
if (serviceRoleKey && (isPublishableKey || badServiceRole)) {
  console.error('[env] SUPABASE_SERVICE_ROLE_KEY debe ser la service_role/secret key de Supabase, no la anon/publishable key.');
  missingEnv.push('SUPABASE_SERVICE_ROLE_KEY (inválida: se configuró la anon/publishable key)');
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  missingEnv,
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
