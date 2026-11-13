const { supabase } = require('../db/supabase');
const express = require('express');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// GET /api/inventory/stock — existencias actuales por ingrediente
router.get('/stock', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ingredients')
      .select('id, name, unit, stock, min_stock, cost_per_unit, active')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[inventory/stock]', err);
    res.status(500).json({ error: 'Error al consultar existencias' });
  }
});

// POST /api/inventory/adjust — ajuste manual de inventario
router.post('/adjust', async (req, res) => {
  try {
    const { ingredient_id, quantity, reason = 'Ajuste manual', type = 'in' } = req.body || {};
    if (!ingredient_id || quantity === undefined) {
      return res.status(400).json({ error: 'ingredient_id y quantity son requeridos' });
    }
    const delta = type === 'out' ? -Math.abs(quantity) : Math.abs(quantity);

    const { data: ing } = await supabase
      .from('ingredients')
      .select('stock')
      .eq('id', ingredient_id)
      .single();
    if (!ing) return res.status(404).json({ error: 'Ingrediente no encontrado' });
    const newStock = ing.stock + delta;
    if (newStock < 0) return res.status(400).json({ error: 'Stock insuficiente' });

    const { error: updErr } = await supabase
      .from('ingredients')
      .update({ stock: newStock })
      .eq('id', ingredient_id);
    if (updErr) throw updErr;

    await supabase.from('inventory_movements').insert({
      ingredient_id,
      quantity: delta,
      type: delta >= 0 ? 'purchase' : 'adjustment',
      reason,
      user_id: req.user.id
    });

    res.json({ ok: true, stock: newStock });
  } catch (err) {
    console.error('[inventory/adjust]', err);
    res.status(500).json({ error: 'Error al ajustar inventario' });
  }
});

// GET /api/inventory/movements — historial de movimientos
router.get('/movements', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*, ingredients(name, unit)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar movimientos' });
  }
});

// Recetas: ingredientes requeridos por producto
router.get('/recipes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('*, products(name, price), ingredients(name, unit, stock)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar recetas' });
  }
});

router.post('/recipes', async (req, res) => {
  try {
    const { product_id, ingredient_id, quantity } = req.body || {};
    if (!product_id || !ingredient_id || !quantity) {
      return res.status(400).json({ error: 'product_id, ingredient_id y quantity son requeridos' });
    }
    const { data, error } = await supabase
      .from('recipes')
      .insert({ product_id, ingredient_id, quantity })
      .select('*, products(name), ingredients(name, unit)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al crear receta' });
  }
});

router.delete('/recipes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('recipes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar receta' });
  }
});

// Alertas de stock bajo
router.get('/alerts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ingredients')
      .select('id, name, unit, stock, min_stock')
      .eq('active', true);
    if (error) throw error;
    const low = data.filter(i => i.min_stock != null && i.stock <= i.min_stock);
    res.json(low);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar alertas' });
  }
});

module.exports = router;
