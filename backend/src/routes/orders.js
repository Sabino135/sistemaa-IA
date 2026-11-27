const { supabase } = require('../db/supabase');
const express = require('express');
const { staffRequired, roleOnly } = require('../middleware/auth');
const { getSettings } = require('./store');
const { logActivity } = require('../lib/activity');

const router = express.Router();
router.use(staffRequired);
const ordersWrite = roleOnly('admin', 'cajero');
const settingsWrite = roleOnly('admin');

const ORDER_STATUSES = ['received', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'review', 'paid', 'rejected', 'cancelled', 'refunded'];
// sales.payment_method solo admite cash/card/transfer; Mercado Pago se
// registra como 'card' (cobro plástico/en línea) en la venta interna.
const SALE_PAYMENT_MAP = { mercadopago: 'card', transfer: 'transfer', cash: 'cash' };

// Columnas agregadas por la migración 20261124_0002 (pueden no existir aún)
const NEW_SETTING_KEYS = [
  'banner_url', 'announcement', 'business_description', 'business_hours',
  'business_email', 'social_facebook', 'social_instagram', 'social_tiktok'
];

// Columnas agregadas por la migración 20261127_0004 (idem)
const NEW_SETTING_KEYS_0004 = [
  'cover_image_url', 'theme_color', 'store_open', 'tax_rate',
  'currency', 'timezone', 'order_prefix', 'prep_time_minutes'
];

// Convierte un pedido web entregado en venta POS + descuento de inventario.
// Idempotente: si el pedido ya tiene sale_id, no hace nada.
async function fulfillOrder(order, req, allowNegative) {
  if (order.sale_id) return { sale_id: order.sale_id, already: true };

  const { data: items, error: iErr } = await supabase
    .from('order_items').select('*').eq('order_id', order.id);
  if (iErr) throw iErr;
  if (!items || items.length === 0) throw new Error('El pedido no tiene items');

  const { data: sale, error: sErr } = await supabase
    .from('sales')
    .insert({
      customer_id: order.customer_id || null,
      user_id: req.user.id,
      subtotal: Number(order.subtotal) || 0,
      tax: Number(order.tax) || 0,
      total: Number(order.total) || 0,
      payment_method: SALE_PAYMENT_MAP[order.payment_method] || 'cash',
      status: 'completed',
      notes: `Pedido web #${order.order_number ?? order.id.slice(0, 8)}`,
      order_id: order.id,
      source: 'web',
      allow_negative_stock: allowNegative === true
    })
    .select('id').single();
  if (sErr) throw sErr;

  const { error: siErr } = await supabase.from('sale_items').insert(
    items.map(i => ({
      sale_id: sale.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total
    }))
  );
  if (siErr) {
    await supabase.from('sales').delete().eq('id', sale.id);
    throw siErr;
  }

  const { error: rpcErr } = await supabase.rpc('deduct_sale_stock', {
    p_sale_id: sale.id,
    p_allow_negative: allowNegative === true,
    p_user_id: req.user.id
  });
  if (rpcErr) {
    await supabase.from('sale_items').delete().eq('sale_id', sale.id);
    await supabase.from('sales').delete().eq('id', sale.id);
    const e = new Error(rpcErr.message);
    e.code = /insufficient_stock/.test(rpcErr.message || '') ? 'INSUFFICIENT_STOCK' : 'RPC_ERROR';
    throw e;
  }

  await supabase.from('orders').update({ sale_id: sale.id }).eq('id', order.id);
  return { sale_id: sale.id, already: false };
}

// Registra un cambio de estado/pago del pedido en order_status_history
// y en el registro de actividad administrativa. Falla silenciosa si la
// migración 0004 aún no está aplicada.
async function recordOrderChange(req, order, field, toValue) {
  const fromValue = order[field];
  if (fromValue === toValue) return;
  try {
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      field,
      from_value: fromValue,
      to_value: toValue,
      changed_by: req.user.id
    });
  } catch (err) {
    console.warn('[orders] history insert:', err?.message || err);
  }
  await logActivity(req, `order.${field}`, 'orders', order.id, {
    order_number: order.order_number,
    from: fromValue,
    to: toValue
  });
}

// Revierte la venta generada por un pedido (cancelación)
async function revertFulfillment(order, req) {
  if (!order.sale_id) return;
  const { data: sale } = await supabase.from('sales').select('id, status').eq('id', order.sale_id).maybeSingle();
  if (sale && sale.status !== 'cancelled') {
    await supabase.rpc('restock_sale', { p_sale_id: sale.id, p_user_id: req.user.id });
    await supabase.from('sales').update({ status: 'cancelled' }).eq('id', sale.id);
  }
}

// GET /api/orders — lista de pedidos web (admin), con filtros.
router.get('/', async (req, res) => {
  try {
    let q = supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.payment_status) q = q.eq('payment_status', req.query.payment_status);
    if (req.query.payment_method) q = q.eq('payment_method', req.query.payment_method);
    if (req.query.delivery_method) q = q.eq('delivery_method', req.query.delivery_method);
    if (req.query.from) q = q.gte('created_at', req.query.from);
    if (req.query.to) q = q.lte('created_at', req.query.to + 'T23:59:59');
    if (req.query.q) q = q.or(`customer_name.ilike.%${req.query.q}%,customer_phone.ilike.%${req.query.q}%`);
    if (req.query.customer_id) q = q.eq('customer_id', req.query.customer_id);
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
router.put('/settings', settingsWrite, async (req, res) => {
  try {
    const allowed = [
      'store_name', 'store_tagline', 'logo_url', 'banner_url', 'announcement',
      'business_description', 'business_hours', 'business_email',
      'social_facebook', 'social_instagram', 'social_tiktok',
      'phone', 'whatsapp', 'address',
      'delivery_enabled', 'pickup_enabled', 'delivery_fee', 'delivery_zones',
      'bank_name', 'bank_account_name', 'bank_clabe', 'bank_account_number',
      'transfer_instructions', 'cash_enabled', 'transfer_enabled', 'mercadopago_enabled',
      // Configuración general (migración 0004)
      'cover_image_url', 'theme_color', 'store_open', 'tax_rate',
      'currency', 'timezone', 'order_prefix', 'prep_time_minutes'
    ];
    const body = {};
    for (const k of allowed) if (req.body[k] !== undefined) body[k] = req.body[k];
    body.updated_at = new Date().toISOString();
    let { data, error } = await supabase
      .from('store_settings').update(body).eq('id', 1).select('*').single();
    // Si la migración 0002 aún no se aplica, las columnas nuevas no existen
    // y PostgREST rechaza TODO el update. Reintentamos solo con las columnas
    // base para no dejar al admin sin poder guardar la configuración.
    if (error) {
      const skip = new Set([...NEW_SETTING_KEYS, ...NEW_SETTING_KEYS_0004]);
      const baseKeys = allowed.filter(k => !skip.has(k));
      const fallback = {};
      for (const k of baseKeys) if (body[k] !== undefined) fallback[k] = body[k];
      fallback.updated_at = body.updated_at;
      ({ data, error } = await supabase
        .from('store_settings').update(fallback).eq('id', 1).select('*').single());
      if (!error) {
        console.warn('[orders settings PUT] columnas nuevas ignoradas (migración 0002 pendiente)');
        return res.json({ ...data, _pending_migration: true });
      }
    }
    if (error) throw error;
    await logActivity(req, 'settings.update', 'store_settings', 1, {
      keys: Object.keys(body).filter(k => k !== 'updated_at')
    });
    res.json(data);
  } catch (err) {
    console.error('[orders settings PUT]', err);
    res.status(500).json({ error: 'Error al guardar la configuración' });
  }
});

// GET /api/orders/:id — detalle + historial de cambios
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders').select('*, order_items(*)').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido no encontrado' });
    let history = [];
    try {
      const { data: h } = await supabase
        .from('order_status_history')
        .select('field, from_value, to_value, created_at, changed_by')
        .eq('order_id', data.id)
        .order('created_at', { ascending: false })
        .limit(100);
      history = h || [];
    } catch { /* migración 0004 pendiente */ }
    res.json({ ...data, history });
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar el pedido' });
  }
});

// PUT /api/orders/:id/status — cambia el estado del pedido.
// Al marcar 'delivered' genera la venta POS + descuento de inventario
// (una sola vez, vía orders.sale_id). Al cancelar, revierte la venta.
router.put('/:id/status', ordersWrite, async (req, res) => {
  try {
    const { status, allow_negative_stock } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Estado de pedido inválido' });
    }
    const override = allow_negative_stock === true && req.user.role === 'admin';

    const { data: order, error: fErr } = await supabase
      .from('orders').select('*').eq('id', req.params.id).maybeSingle();
    if (fErr) throw fErr;
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    if (status === 'delivered' && order.status !== 'delivered' && !order.sale_id) {
      try {
        await fulfillOrder(order, req, override);
      } catch (e) {
        if (e.code === 'INSUFFICIENT_STOCK') {
          return res.status(409).json({
            error: 'Stock insuficiente para surtir el pedido. Ajusta inventario o autoriza la venta en negativo (solo admin).',
            requires_override: true
          });
        }
        throw e;
      }
    }

    if (status === 'cancelled' && order.status !== 'cancelled') {
      await revertFulfillment(order, req);
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;
    await recordOrderChange(req, order, 'status', status);
    res.json(data);
  } catch (err) {
    console.error('[orders status]', err);
    res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
  }
});

// PUT /api/orders/:id/payment — cambia SOLO el estado del pago.
router.put('/:id/payment', ordersWrite, async (req, res) => {
  try {
    const { payment_status } = req.body || {};
    if (!PAYMENT_STATUSES.includes(payment_status)) {
      return res.status(400).json({ error: 'Estado de pago inválido' });
    }
    const { data: prev } = await supabase
      .from('orders').select('id, order_number, payment_status').eq('id', req.params.id).maybeSingle();
    const { data, error } = await supabase
      .from('orders')
      .update({ payment_status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;
    if (prev) await recordOrderChange(req, { ...prev, id: req.params.id }, 'payment_status', payment_status);
    res.json(data);
  } catch (err) {
    console.error('[orders payment]', err);
    res.status(500).json({ error: 'Error al actualizar el estado del pago' });
  }
});

module.exports = router;
