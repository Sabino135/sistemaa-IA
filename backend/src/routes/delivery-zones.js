const { supabase } = require('../db/supabase');
const express = require('express');
const { staffRequired, roleOnly } = require('../middleware/auth');

const router = express.Router();
router.use(staffRequired);
router.use(roleOnly('admin'));

const SELECT = '*';
const UPSERTABLE = ['name', 'geometry', 'delivery_fee', 'active'];

// GET /api/delivery-zones
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('delivery_zones')
      .select(SELECT)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[delivery-zones GET]', err);
    res.status(500).json({ error: 'Error al consultar zonas de entrega' });
  }
});

// POST /api/delivery-zones
router.post('/', async (req, res) => {
  try {
    const { name, geometry, delivery_fee = 0 } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la zona es requerido' });
    }
    const pts = geometry?.points;
    if (!Array.isArray(pts) || pts.length < 3) {
      return res.status(400).json({ error: 'La zona debe ser un polígono con al menos 3 puntos [lat,lng]' });
    }
    const fee = Number(delivery_fee);
    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({ error: 'La tarifa de entrega debe ser un número >= 0' });
    }
    const { data, error } = await supabase
      .from('delivery_zones')
      .insert({ name: name.trim(), geometry: { points: pts }, delivery_fee: fee })
      .select(SELECT).single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[delivery-zones POST]', err);
    res.status(400).json({ error: err.message || 'Error al crear la zona' });
  }
});

// PUT /api/delivery-zones/:id
router.put('/:id', async (req, res) => {
  try {
    const body = {};
    for (const k of UPSERTABLE) if (req.body[k] !== undefined) body[k] = req.body[k];
    if (body.delivery_fee !== undefined) {
      const fee = Number(body.delivery_fee);
      if (!Number.isFinite(fee) || fee < 0) {
        return res.status(400).json({ error: 'La tarifa de entrega debe ser un número >= 0' });
      }
      body.delivery_fee = fee;
    }
    if (body.name !== undefined) body.name = String(body.name).trim();
    const { data, error } = await supabase
      .from('delivery_zones').update(body).eq('id', req.params.id).select(SELECT).single();
    if (error) {
      if (error.code === 'PGRST116' || /0 rows/i.test(error.message || '')) {
        return res.status(404).json({ error: 'Zona no encontrada' });
      }
      throw error;
    }
    res.json(data);
  } catch (err) {
    console.error('[delivery-zones PUT]', err);
    res.status(500).json({ error: 'Error al actualizar la zona' });
  }
});

// DELETE /api/delivery-zones/:id — desactivación lógica
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('delivery_zones').update({ active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[delivery-zones DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar la zona' });
  }
});

module.exports = router;
