const { supabase } = require('../db/supabase');
const express = require('express');
const { resolveUser, authRequired } = require('../middleware/auth');

const router = express.Router();

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Columnas legacy NOT NULL sin default que rompen el INSERT del perfil.
// El mensaje de Postgres es: null value in column "X" of relation "users"
// violates not-null constraint. Excluye las que ya enviamos en el payload.
const KNOWN_COLUMNS = new Set(['id', 'name', 'email', 'role', 'active']);

function legacyNotNullColumns(message = '') {
  const match = /column "([^"]+)" of relation/i.exec(message);
  if (!match) return [];
  const col = match[1];
  return KNOWN_COLUMNS.has(col) ? [] : [col];
}

// GET /api/auth/me — verifica el token (Supabase o JWT propio),
// crea/actualiza el perfil en public.users y lo devuelve.
router.get('/me', async (req, res) => {
  // La verificación del token puede fallar por red o por sesión inválida:
  // eso es un 401, nunca un 500.
  let user;
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    user = await resolveUser(token);
  } catch (err) {
    console.error('[auth/me] resolveUser', err);
    return res.status(401).json({ error: 'No se pudo verificar la sesión' });
  }
  if (!user) return res.status(401).json({ error: 'Token inválido o expirado' });

  // Si la sincronización del perfil en public.users falla (p. ej. error
  // transitorio de Supabase), respondemos 200 con los datos del propio token
  // en lugar de un 500: el usuario está autenticado y puede trabajar; el
  // perfil se reintentará en la próxima llamada.
  // Un comprador de la tienda se registra con user_metadata.is_customer=true
  // (los empleados del panel no lo traen). El rol por defecto del perfil pasa
  // a ser "cliente" para esos casos, evitando dar acceso al panel admin.
  const isCustomer = user.metadata?.is_customer === true || user.metadata?.is_customer === 'true';
  const defaultRole = isCustomer ? 'cliente' : 'cajero';

  const fallbackProfile = {
    id: user.id,
    name: user.name || user.email,
    email: user.email,
    role: user.role || defaultRole,
    active: true
  };

  try {
    // Upsert del perfil: primer login de un usuario de Supabase Auth
    const { data: existing, error: selErr } = await supabase
      .from('users')
      .select('id, name, email, role, active, created_at')
      .eq('id', user.id)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!existing) {
      const payload = {
        id: user.id,
        name: user.name || user.email,
        email: user.email,
        role: defaultRole,
        active: true
      };
      const cols = 'id, name, email, role, active, created_at';
      let { data: created, error } = await supabase
        .from('users')
        .insert(payload)
        .select(cols)
        .single();
      // Esquemas antiguos aún tienen columnas NOT NULL del sistema bcrypt
      // anterior (p. ej. users.password_hash) porque el ALTER de schema.sql
      // no se ha aplicado en esa base de datos. Reintentamos añadiendo las
      // columnas legacy que falten, en lugar de fallar con 500.
      if (error?.code === '23502') {
        const legacy = legacyNotNullColumns(error.message);
        if (legacy.length) {
          const fill = Object.fromEntries(legacy.map(c => [c, 'x']));
          ({ data: created, error } = await supabase
            .from('users')
            .insert({ ...payload, ...fill })
            .select(cols)
            .single());
        }
      }
      if (error) throw error;
      return res.json(created);
    }

    // Mantener nombre/email sincronizados con Supabase Auth
    if (existing.name !== user.name || existing.email !== user.email) {
      await supabase.from('users')
        .update({ name: user.name || existing.name, email: user.email || existing.email })
        .eq('id', user.id);
    }

    res.json(existing);
  } catch (err) {
    console.error('[auth/me]', err);
    res.json(fallbackProfile);
  }
});

// POST /api/auth/logout — el cierre de sesión real ocurre en el cliente (Supabase)
router.post('/logout', authRequired, (req, res) => res.json({ ok: true }));

module.exports = router;
