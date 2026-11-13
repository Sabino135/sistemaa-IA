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
    const { data: existing } = await supabase
      .from('users')
      .select('id, name, email, role, active, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      const { data: created, error } = await supabase
        .from('users')
        .insert({
          id: user.id,
          name: user.name || user.email,
          email: user.email,
          role: 'cajero',
          active: true
        })
        .select('id, name, email, role, active, created_at')
        .single();
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
