const { supabase } = require('../db/supabase');
const express = require('express');
const { staffRequired, roleOnly } = require('../middleware/auth');

const router = express.Router();
router.use(staffRequired);

const KINDS = ['transfer', 'card', 'other'];
const SELECT = '*';
const UPSERTABLE = [
  'name', 'kind', 'bank_name', 'holder_name', 'clabe', 'account_number',
  'card_number', 'instructions', 'image_url', 'active', 'sort_order'
];

// Nunca aceptar ni devolver campos sensibles que no aplican al cobro:
// CVV, NIP y contraseñas bancarias NO tienen columna en la tabla.
function cleanBody(body = {}) {
  const out = {};
  for (const k of UPSERTABLE) if (body[k] !== undefined) out[k] = body[k];
  if (out.kind !== undefined && !KINDS.includes(out.kind)) out.kind = 'transfer';
  if (out.sort_order !== undefined) out.sort_order = parseInt(out.sort_order, 10) || 0;
  return out;
}

// GET /api/payment-methods — lista completa (panel admin)
router.get('/', roleOnly('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payment_methods')
      .select(SELECT)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[payment-methods GET]', err);
    res.status(500).json({ error: 'Error al consultar métodos de pago' });
  }
});

// POST /api/payment-methods — crear cuenta/método de cobro
router.post('/', roleOnly('admin'), async (req, res) => {
  try {
    const body = cleanBody(req.body);
    if (!body.name || !String(body.name).trim()) {
      return res.status(400).json({ error: 'El nombre del método es requerido' });
    }
    const { data, error } = await supabase
      .from('payment_methods')
      .insert(body)
      .select(SELECT)
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[payment-methods POST]', err);
    res.status(400).json({ error: err.message || 'Error al crear el método de pago' });
  }
});

// PUT /api/payment-methods/:id
router.put('/:id', roleOnly('admin'), async (req, res) => {
  try {
    const body = cleanBody(req.body);
    body.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('payment_methods')
      .update(body)
      .eq('id', req.params.id)
      .select(SELECT)
      .single();
    if (error) return res.status(404).json({ error: 'Método de pago no encontrado' });
    res.json(data);
  } catch (err) {
    console.error('[payment-methods PUT]', err);
    res.status(500).json({ error: 'Error al actualizar el método de pago' });
  }
});

// DELETE /api/payment-methods/:id — desactivación lógica
router.delete('/:id', roleOnly('admin'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('payment_methods')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[payment-methods DELETE]', err);
    res.status(500).json({ error: 'Error al eliminar el método de pago' });
  }
});

module.exports = router;
