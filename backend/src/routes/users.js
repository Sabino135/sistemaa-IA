const { supabase } = require('../db/supabase');
const express = require('express');
const { staffRequired, roleOnly } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();
router.use(staffRequired);

const STAFF_ROLES = ['admin', 'cajero', 'inventario'];
const SELECT = 'id, name, email, role, active, created_at';

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// GET /api/users — lista de usuarios del panel (solo admin)
router.get('/', roleOnly('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(SELECT)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[users GET]', err);
    res.status(500).json({ error: 'Error al consultar usuarios' });
  }
});

// POST /api/users — crea usuario real en Supabase Auth + perfil en public.users
router.post('/', roleOnly('admin'), async (req, res) => {
  try {
    const { name, email, password, role = 'cajero' } = req.body || {};
    if (!name || !validEmail(email)) {
      return res.status(400).json({ error: 'Nombre y correo electrónico válido son requeridos' });
    }
    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    // 1) Cuenta de autenticación en Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, is_customer: false }
    });
    if (authErr) {
      const msg = /already|exists|registered/i.test(authErr.message || '')
        ? 'Ya existe un usuario con ese correo'
        : (authErr.message || 'Error al crear la cuenta de acceso');
      return res.status(400).json({ error: msg });
    }
    const authUser = authData.user;

    // 2) Perfil en public.users (fuente de roles del backend)
    const { data: profile, error: pErr } = await supabase
      .from('users')
      .upsert({
        id: authUser.id,
        name,
        email,
        role,
        active: true
      }, { onConflict: 'id' })
      .select(SELECT)
      .single();
    if (pErr) {
      // Revertir la cuenta de Auth para no dejar huérfanos
      await supabase.auth.admin.deleteUser(authUser.id).catch(() => {});
      throw pErr;
    }
    await logActivity(req, 'user.create', 'users', profile.id, { email, role });
    res.status(201).json(profile);
  } catch (err) {
    console.error('[users POST]', err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/users/:id — actualiza perfil; email/password se propagan a Auth
router.put('/:id', roleOnly('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const { name, email, role, active, password } = req.body || {};

    // Un admin no puede quitarse a sí mismo el rol ni desactivarse
    if (id === req.user.id && (role !== undefined && role !== 'admin' || active === false)) {
      return res.status(400).json({ error: 'No puedes cambiar tu propio rol ni desactivarte' });
    }
    if (role !== undefined && !STAFF_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    if (email !== undefined && !validEmail(email)) {
      return res.status(400).json({ error: 'Correo electrónico inválido' });
    }
    if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const { data: existing } = await supabase.from('users').select(SELECT).eq('id', id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Propagar cambios de credenciales a Supabase Auth
    const authUpdate = {};
    if (email !== undefined) authUpdate.email = email;
    if (name !== undefined) authUpdate.user_metadata = { name };
    if (password !== undefined) authUpdate.password = password;
    if (Object.keys(authUpdate).length) {
      const { error: aErr } = await supabase.auth.admin.updateUserById(id, authUpdate);
      if (aErr) return res.status(400).json({ error: aErr.message || 'Error al actualizar la cuenta de acceso' });
    }

    const body = {};
    for (const k of ['name', 'email', 'role', 'active']) {
      if (req.body[k] !== undefined) body[k] = req.body[k];
    }
    const { data, error } = await supabase
      .from('users').update(body).eq('id', id).select(SELECT).single();
    if (error) throw error;
    await logActivity(req, 'user.update', 'users', id, { fields: Object.keys(body) });
    res.json(data);
  } catch (err) {
    console.error('[users PUT]', err);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/users/:id — desactivación lógica (bloquea el acceso)
router.delete('/:id', roleOnly('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    }
    const { error } = await supabase.from('users').update({ active: false }).eq('id', id);
    if (error) throw error;
    await logActivity(req, 'user.deactivate', 'users', id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[users DELETE]', err);
    res.status(500).json({ error: 'Error al desactivar usuario' });
  }
});

module.exports = router;
