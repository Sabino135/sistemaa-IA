const jwt = require('jsonwebtoken');
const config = require('../config');
const { supabase } = require('../db/supabase');

function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

/**
 * Resuelve el usuario a partir del Bearer token.
 * Acepta tanto JWT propios (legacy) como access tokens de Supabase Auth.
 */
async function resolveUser(token) {
  // 1) JWT propio (sistema legacy con bcrypt)
  try {
    const p = jwt.verify(token, config.jwt.secret);
    // Un JWT válido sin `id`/`sub` no identifica a ningún usuario.
    if (!p.id && !p.sub) return null;
    return { id: p.id || p.sub, email: p.email, role: p.role, name: p.name };
  } catch { /* no es JWT propio, probar Supabase */ }

  // 2) Access token de Supabase Auth.
  // Un fallo de verificación (token inválido/expirado) o un error transitorio
  // de red NO deben propagarse como excepción: se devuelve null para que el
  // llamador responda 401 en lugar de 500.
  let authUser;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      // Diagnóstico en los logs de Vercel: si la service key no corresponde
      // al proyecto o es inválida, aquí se verá el motivo del 401.
      if (error) console.warn('[auth] getUser rechazó el token:', error.message || error);
      return null;
    }
    authUser = data.user;
  } catch (err) {
    console.error('[auth] getUser no disponible:', err?.message || err);
    return null;
  }
  const u = authUser;

  // Perfil en public.users (rol y estado operativo).
  // Si la consulta falla (p. ej. problema transitorio), seguimos con los datos
  // del propio token de Supabase en lugar de romper la petición.
  let prof = null;
  try {
    const { data } = await supabase
      .from('users')
      .select('role, active, name')
      .eq('id', u.id)
      .maybeSingle();
    prof = data;
  } catch (err) {
    console.error('[auth] perfil no disponible:', err?.message || err);
  }

  if (prof && prof.active === false) return null;

  // Los registros self-service siempre caen a 'cliente' si aún no tienen
  // perfil en public.users; el rol de staff solo lo asigna un admin.
  const fallbackRole = 'cliente';

  return {
    id: u.id,
    email: u.email,
    name: prof?.name || u.user_metadata?.name || u.email,
    role: prof?.role || u.app_metadata?.role || fallbackRole,
    metadata: u.user_metadata || {}
  };
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const user = await resolveUser(token);
    if (!user) return res.status(401).json({ error: 'Token inválido o usuario inactivo' });
    req.user = user;
    next();
  } catch (err) {
    console.error('[auth] resolveUser', err);
    return res.status(401).json({ error: 'No se pudo verificar la sesión' });
  }
}

// Roles considerados "personal del negocio". Los compradores de la tienda
// ('cliente') pueden autenticarse pero NO deben acceder al panel admin.
const STAFF_ROLES = ['admin', 'cajero', 'inventario'];

// Requiere sesión de un miembro del equipo (cualquier rol excepto 'cliente').
function staffRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!STAFF_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Acceso restringido al personal del negocio' });
    }
    next();
  });
}

// Requiere sesión + rol específico (se evalúa después de authRequired).
function requireRole(...roles) {
  return [authRequired, (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  }];
}

// Solo verifica req.user.role; usar DESPUÉS de authRequired/staffRequired
// para no volver a resolver el token.
function roleOnly(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  };
}

module.exports = { signToken, resolveUser, authRequired, staffRequired, requireRole, roleOnly, STAFF_ROLES };
