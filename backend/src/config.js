const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); // .env raíz
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true }); // backend/.env tiene prioridad

// No hacemos process.exit(1): en Vercel el backend corre como función
// serverless y un exit durante el arranque se traduce en errores 500 sin
// diagnóstico. Acumulamos los faltantes y la app responde 503 descriptivo.
const missingEnv = [];

// Las variables copiadas a mano en el panel de Vercel a veces quedan con
// comillas o espacios alrededor. Un SUPABASE_URL malformado no cae en
// missingEnv (sigue siendo "truthy") y getUser falla como 401 sin pista.
// Limpiamos antes de validar.
function cleanEnv(value) {
  if (typeof value !== 'string') return value;
  let v = value.trim();
  if (v.length >= 2
    && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1);
  }
  return v;
}
for (const key of [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY',
  'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'JWT_SECRET'
]) {
  if (process.env[key]) process.env[key] = cleanEnv(process.env[key]);
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

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
const keyRef = serviceRoleKey ? jwtPayload(serviceRoleKey)?.ref : null;
const urlRef = (() => {
  try { return new URL(process.env.SUPABASE_URL || '').hostname.split('.')[0]; }
  catch { return null; }
})();
if (serviceRoleKey && keyRef && urlRef && keyRef !== urlRef) {
  console.error(`[env] SUPABASE_SERVICE_ROLE_KEY pertenece al proyecto "${keyRef}" pero SUPABASE_URL apunta a "${urlRef}".`);
  missingEnv.push('SUPABASE_SERVICE_ROLE_KEY (no corresponde al proyecto de SUPABASE_URL)');
}

// Chequeo cruzado: el proyecto de SUPABASE_URL debe ser el MISMO que usa el
// frontend para iniciar sesión (VITE_SUPABASE_URL / anon key). Si difieren,
// el login funciona pero /api/auth/me siempre responde 401 porque el token
// fue emitido por otro proyecto. Solo se evalúa si esas variables existen
// en runtime (en Vercel las VITE_ solo llegan a la función si están
// habilitadas para ese entorno).
const frontendRefs = new Set();
for (const v of [process.env.SUPABASE_ANON_KEY, process.env.VITE_SUPABASE_ANON_KEY]) {
  const ref = v ? jwtPayload(v)?.ref : null;
  if (ref) frontendRefs.add(ref);
}
try {
  const ref = new URL(process.env.VITE_SUPABASE_URL || '').hostname.split('.')[0];
  if (ref) frontendRefs.add(ref);
} catch { /* VITE_SUPABASE_URL ausente o inválida: nada que comparar */ }
const mismatchedFrontendRefs = [...frontendRefs].filter(r => r !== urlRef);
if (urlRef && mismatchedFrontendRefs.length) {
  console.error(`[env] SUPABASE_URL apunta al proyecto "${urlRef}" pero el frontend usa el proyecto "${mismatchedFrontendRefs.join(', ')}". El backend no podrá verificar sus sesiones.`);
  missingEnv.push('SUPABASE_URL (no corresponde al proyecto de Supabase del frontend)');
}
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
    projectRef: urlRef,
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
