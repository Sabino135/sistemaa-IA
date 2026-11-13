const { supabase } = require('../db/supabase');
const express = require('express');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// POST /api/sales — registrar venta (POS). Descuenta ingredientes según recetas.
router.post('/', async (req, res) => {
  try {
    const { customer_id = null, items = [], payment_method = 'cash', amount_received = null, notes = '' } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'La venta debe contener al menos un item' });
    }

    // Validar productos y calcular totales
    const productIds = items.map(i => i.product_id);
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, name, price, active')
      .in('id', productIds);
    if (pErr) throw pErr;
    const pMap = new Map(products.map(p => [p.id, p]));

    const saleItems = [];
    let subtotal = 0;
    for (const item of items) {
      const p = pMap.get(item.product_id);
      if (!p || !p.active) return res.status(400).json({ error: `Producto inválido: ${item.product_id}` });
      if (p.price == null) return res.status(400).json({ error: `"${p.name}" no tiene precio configurado` });
      const qty = Number(item.quantity) || 1;
      const lineTotal = p.price * qty;
      subtotal += lineTotal;
      saleItems.push({ product_id: p.id, quantity: qty, unit_price: p.price, total: lineTotal });
    }

    const tax = Math.round(subtotal * 0.16 * 100) / 100; // IVA 16%
    const total = Math.round((subtotal + tax) * 100) / 100;
    const change = amount_received != null ? Math.round((amount_received - total) * 100) / 100 : null;

    // Descontar stock de ingredientes según recetas
    const { data: recipes, error: rErr } = await supabase
      .from('recipes')
      .select('product_id, ingredient_id, quantity')
      .in('product_id', productIds);
    if (rErr) throw rErr;

    const needed = new Map(); // ingredient_id -> cantidad total
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      for (const r of recipes.filter(r => r.product_id === item.product_id)) {
        needed.set(r.ingredient_id, (needed.get(r.ingredient_id) || 0) + r.quantity * qty);
      }
    }

    for (const [ingId, qtyNeeded] of needed) {
      const { data: ing } = await supabase
        .from('ingredients').select('stock, name').eq('id', ingId).single();
      if (!ing) continue;
      const newStock = ing.stock - qtyNeeded;
      if (newStock < 0) {
        return res.status(409).json({
          error: `Stock insuficiente de ${ing.name} (disponible: ${ing.stock}, requerido: ${qtyNeeded})`
        });
      }
    }

    // Crear venta
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
        notes
      })
      .select()
      .single();
    if (sErr) throw sErr;

    // Items
    const { error: siErr } = await supabase.from('sale_items').insert(
      saleItems.map(i => ({ ...i, sale_id: sale.id }))
    );
    if (siErr) throw siErr;

    // Descontar stock + registrar movimientos
    for (const [ingId, qtyNeeded] of needed) {
      const { data: ing } = await supabase
        .from('ingredients').select('stock').eq('id', ingId).single();
      await supabase.from('ingredients')
        .update({ stock: ing.stock - qtyNeeded })
        .eq('id', ingId);
      await supabase.from('inventory_movements').insert({
        ingredient_id: ingId,
        quantity: -qtyNeeded,
        type: 'sale',
        reason: `Venta #${sale.id.slice(0, 8)}`,
        reference_id: sale.id,
        user_id: req.user.id
      });
    }

    res.status(201).json({ sale, items: saleItems });
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
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[sales GET]', err);
    res.status(500).json({ error: 'Error al consultar ventas' });
  }
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

// POST /api/sales/:id/cancel — cancelar venta y reingresar stock
router.post('/:id/cancel', async (req, res) => {
  try {
    const { data: sale } = await supabase.from('sales').select('*').eq('id', req.params.id).single();
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
    if (sale.status === 'cancelled') return res.status(400).json({ error: 'La venta ya está cancelada' });

    // Reingresar ingredientes
    const { data: items } = await supabase.from('sale_items').select('product_id, quantity').eq('sale_id', sale.id);
    const { data: recipes } = await supabase.from('recipes').select('product_id, ingredient_id, quantity').in('product_id', items.map(i => i.product_id));
    for (const item of items) {
      for (const r of recipes.filter(r => r.product_id === item.product_id)) {
        const { data: ing } = await supabase.from('ingredients').select('stock').eq('id', r.ingredient_id).single();
        await supabase.from('ingredients').update({ stock: ing.stock + r.quantity * item.quantity }).eq('id', r.ingredient_id);
        await supabase.from('inventory_movements').insert({
          ingredient_id: r.ingredient_id,
          quantity: r.quantity * item.quantity,
          type: 'adjustment',
          reason: `Cancelación venta #${sale.id.slice(0, 8)}`,
          reference_id: sale.id,
          user_id: req.user.id
        });
      }
    }

    await supabase.from('sales').update({ status: 'cancelled' }).eq('id', sale.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[sales cancel]', err);
    res.status(500).json({ error: 'Error al cancelar venta' });
  }
});

module.exports = router;
