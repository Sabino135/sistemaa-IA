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
    return { id: p.id, email: p.email, role: p.role, name: p.name };
  } catch { /* no es JWT propio, probar Supabase */ }

  // 2) Access token de Supabase Auth
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const u = data.user;

  // Perfil en public.users (rol y estado operativo)
  const { data: prof } = await supabase
    .from('users')
    .select('role, active, name')
    .eq('id', u.id)
    .maybeSingle();

  if (prof && prof.active === false) return null;

  return {
    id: u.id,
    email: u.email,
    name: prof?.name || u.user_metadata?.name || u.email,
    role: prof?.role || u.app_metadata?.role || 'cajero'
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

module.exports = { signToken, resolveUser, authRequired };
