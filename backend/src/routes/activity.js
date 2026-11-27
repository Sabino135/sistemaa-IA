const { supabase } = require('../db/supabase');
const express = require('express');
const { staffRequired, roleOnly } = require('../middleware/auth');

const router = express.Router();
router.use(staffRequired);

// GET /api/activity — registro de actividad administrativa (solo admin)
router.get('/', roleOnly('admin'), async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    let q = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (req.query.action) q = q.eq('action', req.query.action);
    if (req.query.q) q = q.or(`action.ilike.%${req.query.q}%,user_email.ilike.%${req.query.q}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    // Si la migración 0004 aún no está aplicada, la tabla no existe.
    if (/relation|does not exist|42P01|schema cache|PGRST20/i.test(err?.message || '') || /42P01|PGRST20/.test(err?.code || '')) {
      return res.json([]);
    }
    console.error('[activity GET]', err);
    res.status(500).json({ error: 'Error al consultar el registro de actividad' });
  }
});

module.exports = router;
