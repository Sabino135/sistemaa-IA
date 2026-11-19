const { supabase } = require('../db/supabase');
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getSettings } = require('./store');

const router = express.Router();
router.use(authRequired);

const ORDER_STATUSES = ['received', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'rejected', 'cancelled', 'refunded'];

// GET /api/orders — lista de pedidos web (admin), con filtros por estado.
router.get('/', async (req, res) => {
  try {
    let q = supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.payment_status) q = q.eq('payment_status', req.query.payment_status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[orders GET]', err);
    res.status(500).json({ error: 'Error al consultar pedidos' });
  }
});

// GET /api/orders/settings — configuración de la tienda (admin)
router.get('/settings', async (req, res) => {
  try {
    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ error: 'Error al cargar la configuración' });
  }
});

// PUT /api/orders/settings — actualizar configuración de la tienda (admin)
router.put('/settings', async (req, res) => {
  try {
    const allowed = [
      'store_name', 'store_tagline', 'logo_url', 'phone', 'whatsapp', 'address',
      'delivery_enabled', 'pickup_enabled', 'delivery_fee', 'delivery_zones',
      'bank_name', 'bank_account_name', 'bank_clabe', 'bank_account_number',
      'transfer_instructions', 'cash_enabled', 'transfer_enabled', 'mercadopago_enabled'
    ];
    const body = {};
    for (const k of allowed) if (req.body[k] !== undefined) body[k] = req.body[k];
    body.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('store_settings').update(body).eq('id', 1).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[orders settings PUT]', err);
    res.status(500).json({ error: 'Error al guardar la configuración' });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders').select('*, order_items(*)').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar el pedido' });
  }
});

// PUT /api/orders/:id/status — cambia SOLO el estado del pedido.
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Estado de pedido inválido' });
    }
    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[orders status]', err);
    res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
  }
});

// PUT /api/orders/:id/payment — cambia SOLO el estado del pago.
router.put('/:id/payment', async (req, res) => {
  try {
    const { payment_status } = req.body || {};
    if (!PAYMENT_STATUSES.includes(payment_status)) {
      return res.status(400).json({ error: 'Estado de pago inválido' });
    }
    const { data, error } = await supabase
      .from('orders')
      .update({ payment_status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[orders payment]', err);
    res.status(500).json({ error: 'Error al actualizar el estado del pago' });
  }
});

module.exports = router;
