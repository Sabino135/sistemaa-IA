const { supabase } = require('../db/supabase');
const express = require('express');
const { resolveUser, authRequired } = require('../middleware/auth');

const router = express.Router();

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// GET /api/auth/me — verifica el token (Supabase o JWT propio),
// crea/actualiza el perfil en public.users y lo devuelve.
router.get('/me', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const user = await resolveUser(token);
    if (!user) return res.status(401).json({ error: 'Token inválido o expirado' });

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
        role: 'cajero',
        active: true
      };
      const cols = 'id, name, email, role, active, created_at';
      let { data: created, error } = await supabase
        .from('users')
        .insert(payload)
        .select(cols)
        .single();
      // Esquemas antiguos aún tienen users.password_hash NOT NULL
      // (el ALTER de schema.sql no se ha aplicado en esa base de datos)
      if (error?.code === '23502' && error.message?.includes('password_hash')) {
        ({ data: created, error } = await supabase
          .from('users')
          .insert({ ...payload, password_hash: 'x' })
          .select(cols)
          .single());
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
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
});

// POST /api/auth/logout — el cierre de sesión real ocurre en el cliente (Supabase)
router.post('/logout', authRequired, (req, res) => res.json({ ok: true }));

module.exports = router;
