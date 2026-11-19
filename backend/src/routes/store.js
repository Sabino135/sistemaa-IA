const { supabase } = require('../db/supabase');
const express = require('express');
const crypto = require('crypto');
const { containsPoint, validCoordinates } = require('../lib/geo');

const router = express.Router();

// Tasa de IVA de la tienda (misma que el POS). Ajustar si cambia el régimen.
const TAX_RATE = 0.16;

function validPhone(p) {
  return typeof p === 'string' && p.replace(/\D/g, '').length >= 8;
}

// ---- Configuración de la tienda (fila única id=1) ------------------------
async function getSettings() {
  const { data, error } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (data) return data;
  // Si no existe (migración recién aplicada), crearla al vuelo.
  const { data: created, error: cErr } = await supabase
    .from('store_settings').insert({ id: 1 }).select('*').single();
  if (cErr) throw cErr;
  return created;
}

// GET /api/store/settings — configuración pública (sin secretos)
router.get('/settings', async (req, res) => {
  try {
    const s = await getSettings();
    res.json({
      store_name: s.store_name,
      store_tagline: s.store_tagline,
      logo_url: s.logo_url,
      phone: s.phone,
      whatsapp: s.whatsapp,
      address: s.address,
      delivery_enabled: s.delivery_enabled,
      pickup_enabled: s.pickup_enabled,
      delivery_fee: Number(s.delivery_fee || 0),
      delivery_zones: s.delivery_zones,
      bank: {
        bank_name: s.bank_name,
        account_name: s.bank_account_name,
        clabe: s.bank_clabe,
        account_number: s.bank_account_number,
        instructions: s.transfer_instructions
      },
      payment_methods: {
        cash: s.cash_enabled,
        transfer: s.transfer_enabled,
        mercadopago: s.mercadopago_enabled && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
      }
    });
  } catch (err) {
    console.error('[store/settings]', err);
    res.status(500).json({ error: 'Error al cargar la configuración de la tienda' });
  }
});

// Zonas de entrega activas con su tarifa
async function getDeliveryZones() {
  const { data, error } = await supabase
    .from('delivery_zones')
    .select('id, name, geometry, delivery_fee')
    .eq('active', true);
  if (error) throw error;
  return data || [];
}

// Encuentra la zona que contiene el punto; null si ninguna.
function matchZone(zones, lat, lng) {
  return zones.find(z => containsPoint(z.geometry || {}, 'polygon', [lat, lng])) || null;
}

// POST /api/store/delivery/check — valida cobertura y tarifa para un punto.
// Body: { lat, lng }. Responde { covered, zone_name, delivery_fee }.
router.post('/delivery/check', async (req, res) => {
  try {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!validCoordinates(lat, lng)) {
      return res.status(400).json({ error: 'lat y lng válidos son requeridos' });
    }
    const zones = await getDeliveryZones();
    const zone = matchZone(zones, lat, lng);
    if (zone) {
      return res.json({ covered: true, zone_name: zone.name, delivery_fee: Number(zone.delivery_fee) });
    }
    // Sin zona que cubra el punto: cubierto solo si NO hay zonas configuradas
    // (en ese caso aplica la tarifa plana de settings).
    if (zones.length === 0) {
      const s = await getSettings();
      return res.json({ covered: true, zone_name: null, delivery_fee: Number(s.delivery_fee || 0) });
    }
    res.json({ covered: false, zone_name: null, delivery_fee: null });
  } catch (err) {
    console.error('[store/delivery/check]', err);
    res.status(500).json({ error: 'Error al verificar la zona de entrega' });
  }
});

// GET /api/store/products — catálogo público (solo activos y con precio)
router.get('/products', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, price, image_url, category_id, categories(name)')
      .eq('active', true)
      .not('price', 'is', null)
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[store/products]', err);
    res.status(500).json({ error: 'Error al cargar el catálogo' });
  }
});

// POST /api/store/orders — crear pedido (invitado o cliente registrado)
router.post('/orders', async (req, res) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'El pedido no tiene productos' });

    const name = (b.customer_name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Ingresa tu nombre' });
    if (!validPhone(b.customer_phone)) return res.status(400).json({ error: 'Ingresa un teléfono válido' });

    const delivery_method = b.delivery_method === 'pickup' ? 'pickup' : 'delivery';
    const payment_method = ['mercadopago', 'transfer', 'cash'].includes(b.payment_method)
      ? b.payment_method : null;
    if (!payment_method) return res.status(400).json({ error: 'Selecciona un método de pago' });

    if (delivery_method === 'delivery' && !(b.delivery_address || '').trim()) {
      return res.status(400).json({ error: 'Ingresa la dirección de entrega' });
    }

    const settings = await getSettings();
    if (delivery_method === 'delivery' && !settings.delivery_enabled) {
      return res.status(400).json({ error: 'La entrega a domicilio no está disponible' });
    }
    if (delivery_method === 'pickup' && !settings.pickup_enabled) {
      return res.status(400).json({ error: 'Recoger en establecimiento no está disponible' });
    }
    if (payment_method === 'cash' && !settings.cash_enabled) {
      return res.status(400).json({ error: 'El pago en efectivo no está disponible' });
    }
    if (payment_method === 'transfer' && !settings.transfer_enabled) {
      return res.status(400).json({ error: 'La transferencia no está disponible' });
    }
    if (payment_method === 'mercadopago' &&
        !(settings.mercadopago_enabled && process.env.MERCADOPAGO_ACCESS_TOKEN)) {
      return res.status(400).json({ error: 'Mercado Pago no está disponible por el momento' });
    }

    // Validar productos y calcular importes SIEMPRE con precios del servidor.
    const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
    const { data: products, error: pErr } = await supabase
      .from('products').select('id, name, price, active').in('id', ids);
    if (pErr) throw pErr;
    const pMap = new Map(products.map(p => [p.id, p]));

    let subtotal = 0;
    const orderItems = [];
    for (const it of items) {
      const p = pMap.get(it.product_id);
      if (!p || !p.active) return res.status(400).json({ error: 'Producto inválido en el pedido' });
      if (p.price == null) return res.status(400).json({ error: `"${p.name}" no tiene precio configurado` });
      const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
      const lineTotal = Math.round(p.price * qty * 100) / 100;
      subtotal += lineTotal;
      orderItems.push({ product_id: p.id, name: p.name, unit_price: p.price, quantity: qty, total: lineTotal });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;

    // Tarifa de entrega: si hay zonas configuradas y el cliente envió
    // coordenadas, se valida cobertura y se cobra la tarifa de la zona.
    // Sin coordenadas se usa la tarifa plana (el repartidor confirma la zona).
    let delivery_fee = 0;
    let zoneName = null;
    if (delivery_method === 'delivery') {
      const lat = Number(b.delivery_lat);
      const lng = Number(b.delivery_lng);
      const hasCoords = validCoordinates(lat, lng);
      const zones = await getDeliveryZones();
      if (hasCoords && zones.length > 0) {
        const zone = matchZone(zones, lat, lng);
        if (!zone) {
          return res.status(400).json({ error: 'Tu dirección está fuera de la zona de entrega' });
        }
        delivery_fee = Number(zone.delivery_fee || 0);
        zoneName = zone.name;
      } else {
        delivery_fee = Number(settings.delivery_fee || 0);
      }
    }
    const total = Math.round((subtotal + tax + delivery_fee) * 100) / 100;

    // Cliente registrado (opcional): resolver user_id si viene un Bearer válido.
    let userId = null, customerId = null;
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try {
        const { resolveUser } = require('../middleware/auth');
        const u = await resolveUser(token);
        if (u && u.role === 'cliente') userId = u.id;
      } catch { /* invitado */ }
    }
    // Vincular/crear ficha en customers (por teléfono) para historial del negocio.
    try {
      const { data: existingCust } = await supabase
        .from('customers').select('id').eq('name', name).maybeSingle();
      if (existingCust) {
        customerId = existingCust.id;
      } else {
        const { data: newCust } = await supabase
          .from('customers')
          .insert({ name, phone: b.customer_phone, email: b.customer_email || null, address: b.delivery_address || null })
          .select('id').single();
        customerId = newCust?.id || null;
      }
    } catch { /* la ficha de cliente es opcional */ }

    const orderNumber = 'D-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        customer_id: customerId,
        customer_name: name,
        customer_phone: b.customer_phone,
        customer_email: b.customer_email || null,
        delivery_method,
        delivery_address: delivery_method === 'delivery' ? (b.delivery_address || '').trim() : null,
        delivery_notes: b.delivery_notes || null,
        payment_method,
        payment_status: 'pending',
        status: 'received',
        subtotal, delivery_fee, tax, total,
        notes: b.notes || null,
        delivery_notes: [b.delivery_notes, zoneName ? `Zona: ${zoneName}` : null].filter(Boolean).join(' · ') || null,
        payment_reference: orderNumber // referencia legible hasta que MP asigne una
      })
      .select('*')
      .single();
    if (oErr) throw oErr;

    const { error: oiErr } = await supabase
      .from('order_items').insert(orderItems.map(i => ({ ...i, order_id: order.id })));
    if (oiErr) throw oiErr;

    // Mercado Pago: crear preferencia (Checkout Pro) si aplica.
    let init_point = null;
    if (payment_method === 'mercadopago') {
      try {
        const { createPreference } = require('../payments/mercadopago');
        const pref = await createPreference(order, orderItems);
        init_point = pref.init_point;
        await supabase.from('orders')
          .update({ payment_reference: pref.id })
          .eq('id', order.id);
      } catch (mpErr) {
        console.error('[store/orders] MP', mpErr);
        return res.status(502).json({
          error: 'No se pudo iniciar el pago con Mercado Pago. Intenta de nuevo o elige otro método.'
        });
      }
    }

    res.status(201).json({
      order: {
        id: order.id,
        order_number: orderNumber,
        total: order.total,
        subtotal: order.subtotal,
        tax: order.tax,
        delivery_fee: order.delivery_fee,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        status: order.status,
        delivery_method: order.delivery_method
      },
      init_point,
      guest_token: order.guest_token
    });
  } catch (err) {
    console.error('[store/orders POST]', err);
    res.status(500).json({ error: 'Error al crear el pedido' });
  }
});

// GET /api/store/orders/:id?token=... — consultar pedido propio (invitado o cliente)
router.get('/orders/:id', async (req, res) => {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Autorización: token de invitado, o ser el dueño (cliente registrado).
    const token = req.query.token || '';
    let authorized = token && token === order.guest_token;
    if (!authorized) {
      const header = req.headers.authorization || '';
      const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (bearer) {
        try {
          const { resolveUser } = require('../middleware/auth');
          const u = await resolveUser(bearer);
          if (u && (u.id === order.user_id || u.role === 'admin')) authorized = true;
        } catch { /* sin acceso */ }
      }
    }
    if (!authorized) return res.status(403).json({ error: 'No tienes acceso a este pedido' });

    res.json(order);
  } catch (err) {
    console.error('[store/orders GET]', err);
    res.status(500).json({ error: 'Error al consultar el pedido' });
  }
});

module.exports = { router, getSettings, TAX_RATE };
