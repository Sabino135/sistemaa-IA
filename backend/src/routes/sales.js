const { supabase } = require('../db/supabase');
const express = require('express');
const { staffRequired } = require('../middleware/auth');

const router = express.Router();
router.use(staffRequired);
const IVA = 0.16;

// POST /api/sales — registrar venta (POS). Descuenta ingredientes según
// recetas de forma atómica (RPC deduct_sale_stock) y es idempotente
// mediante client_ref (el frontend genera un UUID por intento de cobro).
router.post('/', async (req, res) => {
  try {
    const {
      customer_id = null,
      items = [],
      payment_method = 'cash',
      amount_received = null,
      notes = '',
      client_ref = null,
      allow_negative_stock = false
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'La venta debe contener al menos un item' });
    }
    if (!['cash', 'card', 'transfer'].includes(payment_method)) {
      return res.status(400).json({ error: 'Método de pago inválido' });
    }
    // El override de stock negativo solo lo puede autorizar un administrador
    const override = allow_negative_stock === true && req.user.role === 'admin';

    // Idempotencia: si ya existe una venta con este client_ref, devolverla
    if (client_ref) {
      const { data: dup } = await supabase
        .from('sales').select('id').eq('client_ref', client_ref).maybeSingle();
      if (dup) {
        const { data: existing } = await supabase
          .from('sales')
          .select('*, sale_items(*, products(name)), customers(name), users(name)')
          .eq('id', dup.id).single();
        return res.status(200).json({ sale: existing, items: existing?.sale_items || [], duplicate: true });
      }
    }

    // Validar productos y calcular totales
    const productIds = [...new Set(items.map(i => i.product_id))];
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, name, price, active, track_inventory')
      .in('id', productIds);
    if (pErr) throw pErr;
    const pMap = new Map(products.map(p => [p.id, p]));

    const saleItems = [];
    let subtotal = 0;
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Las cantidades deben ser mayores a 0' });
      }
      const p = pMap.get(item.product_id);
      if (!p || !p.active) return res.status(400).json({ error: `Producto inválido: ${item.product_id}` });
      if (p.price == null) return res.status(400).json({ error: `"${p.name}" no tiene precio configurado` });
      const lineTotal = Math.round(p.price * qty * 100) / 100;
      subtotal += lineTotal;
      saleItems.push({ product_id: p.id, quantity: qty, unit_price: p.price, total: lineTotal });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    const tax = Math.round(subtotal * IVA * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const change = amount_received != null ? Math.round((amount_received - total) * 100) / 100 : null;
    if (change != null && change < -0.01) {
      return res.status(400).json({ error: `Monto insuficiente: faltan $${Math.abs(change).toFixed(2)}` });
    }

    // Recetas y stock disponible por ingrediente
    const { data: recipes, error: rErr } = await supabase
      .from('recipes')
      .select('product_id, ingredient_id, quantity')
      .in('product_id', productIds);
    if (rErr) throw rErr;

    const recipesByProduct = new Map();
    for (const r of recipes || []) {
      if (!recipesByProduct.has(r.product_id)) recipesByProduct.set(r.product_id, []);
      recipesByProduct.get(r.product_id).push(r);
    }

    const { data: ings } = await supabase
      .from('ingredients').select('id, name, unit, stock').in(
        'id', [...new Set((recipes || []).map(r => r.ingredient_id))]
      );
    const stockMap = new Map((ings || []).map(i => [i.id, i]));

    // Unidades vendidas por producto
    const qtyByProduct = new Map();
    for (const i of saleItems) {
      qtyByProduct.set(i.product_id, (qtyByProduct.get(i.product_id) || 0) + i.quantity);
    }

    // Validación previa de disponibilidad (el RPC vuelve a verificar
    // atómicamente al descontar; esto solo da mensajes de error claros).
    const shortages = [];
    for (const [pid, qty] of qtyByProduct) {
      const p = pMap.get(pid);
      if (!p.track_inventory) continue; // producto sin control de inventario
      const pRecipes = recipesByProduct.get(pid) || [];
      if (pRecipes.length === 0) {
        // Producto con control de inventario pero sin receta: no hay forma
        // de saber cuántas unidades se pueden preparar.
        shortages.push({ product: p.name, needed: qty, available: 0, reason: 'sin_receta' });
        continue;
      }
      // Cuántas unidades del producto alcanza el ingrediente más escaso
      let maxUnits = Infinity;
      for (const r of pRecipes) {
        const ing = stockMap.get(r.ingredient_id);
        if (!ing) continue;
        const perUnit = Number(r.quantity) || 0;
        if (perUnit <= 0) continue;
        maxUnits = Math.min(maxUnits, Math.floor(Number(ing.stock) / perUnit));
      }
      if (qty > maxUnits) {
        shortages.push({ product: p.name, needed: qty, available: Math.max(0, maxUnits) });
      }
    }

    if (shortages.length && !override) {
      const detalle = shortages
        .map(s => s.reason === 'sin_receta'
          ? `"${s.product}" no tiene receta configurada`
          : `"${s.product}": disponibles ${s.available}, solicitadas ${s.needed}`)
        .join('; ');
      return res.status(409).json({
        error: `Stock insuficiente. ${detalle}`,
        shortages,
        requires_override: true
      });
    }

    // Crear venta (con client_ref para idempotencia)
    const { data: sale, error: sErr } = await supabase
      .from('sales')
      .insert({
        customer_id,
        user_id: req.user.id,
        subtotal,
        tax,
        total,
        payment_method,
        amount_received,
        change_given: change,
        status: 'completed',
        notes,
        client_ref: client_ref || null,
        allow_negative_stock: override,
        source: 'pos'
      })
      .select()
      .single();
    if (sErr) {
      // Carrera de idempotencia: otro request insertó el mismo client_ref
      if (sErr.code === '23505' && client_ref) {
        const { data: dup } = await supabase
          .from('sales')
          .select('*, sale_items(*, products(name)), customers(name), users(name)')
          .eq('client_ref', client_ref)
          .single();
        if (dup) return res.status(200).json({ sale: dup, duplicate: true });
      }
      throw sErr;
    }

    const { error: siErr } = await supabase.from('sale_items').insert(
      saleItems.map(i => ({ ...i, sale_id: sale.id }))
    );
    if (siErr) {
      await supabase.from('sales').delete().eq('id', sale.id);
      throw siErr;
    }

    // Descuento atómico de inventario (transacción en Postgres)
    const { error: rpcErr } = await supabase.rpc('deduct_sale_stock', {
      p_sale_id: sale.id,
      p_allow_negative: override,
      p_user_id: req.user.id
    });
    if (rpcErr) {
      // Compensar: la RPC es atómica, solo queda borrar la venta recién creada
      await supabase.from('sale_items').delete().eq('sale_id', sale.id);
      await supabase.from('sales').delete().eq('id', sale.id);
      if (/insufficient_stock/.test(rpcErr.message || '')) {
        return res.status(409).json({
          error: 'Stock insuficiente al momento de confirmar la venta',
          requires_override: true
        });
      }
      throw rpcErr;
    }

    const { data: full } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(name)), customers(name), users(name)')
      .eq('id', sale.id).single();

    res.status(201).json({ sale: full, items: saleItems });
  } catch (err) {
    console.error('[sales POST]', err);
    res.status(500).json({ error: 'Error al registrar la venta' });
  }
});

// GET /api/sales — historial de ventas
router.get('/', async (req, res) => {
  try {
    let q = supabase
      .from('sales')
      .select('*, sale_items(*, products(name)), customers(name), users(name)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (req.query.from) q = q.gte('created_at', req.query.from);
    if (req.query.to) q = q.lte('created_at', req.query.to + 'T23:59:59');
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.source) q = q.eq('source', req.query.source);
    if (req.query.customer_id) q = q.eq('customer_id', req.query.customer_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[sales GET]', err);
    res.status(500).json({ error: 'Error al consultar ventas' });
  }
});

// GET /api/sales/meta/capabilities — flags de permiso para el frontend
router.get('/meta/capabilities', (req, res) => {
  res.json({ can_override_stock: req.user.role === 'admin' });
});

// GET /api/sales/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(name, price)), customers(name), users(name)')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar venta' });
  }
});

// POST /api/sales/:id/cancel — cancelar venta y reingresar stock (atómico)
router.post('/:id/cancel', async (req, res) => {
  try {
    const { data: sale } = await supabase.from('sales').select('*').eq('id', req.params.id).single();
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
    if (sale.status === 'cancelled') return res.status(400).json({ error: 'La venta ya está cancelada' });

    // Reintegro atómico de ingredientes
    const { error: rpcErr } = await supabase.rpc('restock_sale', {
      p_sale_id: sale.id,
      p_user_id: req.user.id
    });
    if (rpcErr) throw rpcErr;

    await supabase.from('sales').update({ status: 'cancelled' }).eq('id', sale.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[sales cancel]', err);
    res.status(500).json({ error: 'Error al cancelar venta' });
  }
});

module.exports = router;
