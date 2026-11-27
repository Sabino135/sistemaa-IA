const { supabase } = require('../db/supabase');
const express = require('express');
const crypto = require('crypto');
const { containsPoint, validCoordinates } = require('../lib/geo');

const router = express.Router();

// Tasa de IVA por defecto de la tienda. La configurable vive en
// store_settings.tax_rate y se aplica en POST /orders.
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

// Cuentas de cobro activas (transferencias/tarjetas) para mostrar al cliente.
// Solo expone los campos necesarios para pagar; nunca CVV ni credenciales.
async function getPaymentAccounts() {
  try {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('id, name, kind, bank_name, holder_name, clabe, account_number, card_number, instructions, image_url, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    // Si la tabla aún no existe (migración pendiente), la tienda sigue
    // funcionando con los datos bancarios legacy de store_settings.
    console.warn('[store/settings] payment_methods no disponible:', err.message);
    return [];
  }
}

// GET /api/store/settings — configuración pública (sin secretos)
router.get('/settings', async (req, res) => {
  try {
    const s = await getSettings();
    const accounts = await getPaymentAccounts();
    res.json({
      store_name: s.store_name,
      store_tagline: s.store_tagline,
      logo_url: s.logo_url,
      banner_url: s.banner_url || null,
      announcement: s.announcement || null,
      business_description: s.business_description || null,
      business_hours: s.business_hours || null,
      phone: s.phone,
      whatsapp: s.whatsapp,
      email: s.business_email || null,
      address: s.address,
      social: {
        facebook: s.social_facebook || null,
        instagram: s.social_instagram || null,
        tiktok: s.social_tiktok || null
      },
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
      payment_accounts: accounts,
      payment_methods: {
        cash: s.cash_enabled,
        transfer: s.transfer_enabled,
        mercadopago: s.mercadopago_enabled && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)
      },
      // Configuración general (migración 0004; tolerante si falta la columna)
      cover_image_url: s.cover_image_url || null,
      theme_color: s.theme_color || '#f97316',
      store_open: s.store_open !== false,
      tax_rate: Number(s.tax_rate ?? TAX_RATE),
      currency: s.currency || 'MXN',
      timezone: s.timezone || 'America/Mexico_City',
      order_prefix: s.order_prefix || 'D-',
      prep_time_minutes: Number(s.prep_time_minutes ?? 20)
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
    const cols = 'id, name, description, price, image_url, category_id, featured, categories(name)';
    let { data, error } = await supabase
      .from('products')
      .select(cols)
      .eq('active', true)
      .not('price', 'is', null)
      .order('name');
    // Si la migración 0002 aún no se aplica, 'featured' no existe: reintentar sin ella.
    if (error) {
      ({ data, error } = await supabase
        .from('products')
        .select('id, name, description, price, image_url, category_id, categories(name)')
        .eq('active', true)
        .not('price', 'is', null)
        .order('name'));
    }
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
    if (settings.store_open === false) {
      return res.status(400).json({ error: 'La tienda está cerrada temporalmente. Intenta más tarde.' });
    }
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

    const taxRate = Number(settings.tax_rate ?? TAX_RATE);
    const tax = Math.round(subtotal * taxRate * 100) / 100;

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

    const orderPrefix = settings.order_prefix || 'D-';
    const orderNumber = orderPrefix + crypto.randomBytes(3).toString('hex').toUpperCase();

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

// GET /api/store/orders/mine — pedidos del cliente autenticado (tienda).
// Requiere Bearer de Supabase Auth con is_customer o perfil role='cliente'.
router.get('/orders/mine', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Inicia sesión para ver tus pedidos' });

    const { resolveUser } = require('../middleware/auth');
    const u = await resolveUser(token);
    if (!u) return res.status(401).json({ error: 'Sesión inválida o expirada' });

    const isCustomer = u.metadata?.is_customer === true || u.metadata?.is_customer === 'true' || u.role === 'cliente';
    if (!isCustomer && u.role !== 'admin') {
      return res.status(403).json({ error: 'Esta sección es para clientes de la tienda' });
    }

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, payment_status, payment_method, delivery_method, total, created_at, order_items(name, quantity, unit_price, total)')
      .eq('user_id', u.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[store/orders/mine]', err);
    res.status(500).json({ error: 'Error al consultar tus pedidos' });
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

// PUT /api/store/orders/:id/proof — el cliente adjunta su comprobante de
// transferencia. Autorización: token de invitado (?token=), dueño de la
// cuenta (Bearer) o staff/admin. Al adjuntarlo, un pago 'pending' de
// transferencia pasa a 'review' para que el admin lo verifique.
router.put('/orders/:id/proof', async (req, res) => {
  try {
    const proofUrl = String(req.body?.proof_url || '').trim();
    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const allowedPrefix = `${supabaseUrl}/storage/v1/object/public/payment-proofs/`;
    if (!proofUrl.startsWith(allowedPrefix)) {
      return res.status(400).json({ error: 'URL de comprobante inválida' });
    }

    const { data: order, error: fErr } = await supabase
      .from('orders').select('id, user_id, guest_token, payment_method, payment_status, payment_proof_url')
      .eq('id', req.params.id).maybeSingle();
    if (fErr) throw fErr;
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Autorización: token de invitado, dueño de la cuenta o staff.
    let authorized = req.query.token && req.query.token === order.guest_token;
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!authorized && bearer) {
      try {
        const { resolveUser } = require('../middleware/auth');
        const u = await resolveUser(bearer);
        if (u && (u.id === order.user_id || ['admin', 'cajero', 'inventario'].includes(u.role))) authorized = true;
      } catch { /* sin acceso */ }
    }
    if (!authorized) return res.status(403).json({ error: 'No tienes acceso a este pedido' });
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Este pedido ya está pagado' });
    }

    const update = { payment_proof_url: proofUrl, updated_at: new Date().toISOString() };
    if (order.payment_method === 'transfer' && order.payment_status === 'pending') {
      update.payment_status = 'review';
    }
    const { data, error } = await supabase
      .from('orders').update(update).eq('id', order.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[store/orders proof]', err);
    res.status(500).json({ error: 'Error al guardar el comprobante' });
  }
});

module.exports = { router, getSettings, TAX_RATE };
