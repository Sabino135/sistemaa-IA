const { supabase } = require('../db/supabase');
const express = require('express');

/**
 * Fábrica de rutas CRUD genéricas sobre Supabase.
 * tabla: nombre de la tabla, select: columnas por defecto,
 * updatable: columnas permitidas en insert/update.
 */
function crudRouter({ tabla, select = '*', updatable, searchFields = ['name'] }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      let q = supabase.from(tabla).select(select);
      if (req.query.active !== undefined) q = q.eq('active', req.query.active === 'true');
      if (req.query.search) {
        const or = searchFields.map(f => `${f}.ilike.%${req.query.search}%`).join(',');
        q = q.or(or);
      }
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error(`[crud:${tabla}] GET`, err);
      res.status(500).json({ error: 'Error al consultar datos' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { data, error } = await supabase.from(tabla).select(select).eq('id', req.params.id).single();
      if (error) return res.status(404).json({ error: 'Registro no encontrado' });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Error al consultar registro' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const body = {};
      for (const k of updatable) if (req.body[k] !== undefined) body[k] = req.body[k];
      const { data, error } = await supabase.from(tabla).insert(body).select(select).single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      console.error(`[crud:${tabla}] POST`, err);
      res.status(400).json({ error: err.message || 'Error al crear registro' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const body = {};
      for (const k of updatable) if (req.body[k] !== undefined) body[k] = req.body[k];
      const { data, error } = await supabase.from(tabla).update(body).eq('id', req.params.id).select(select).single();
      if (error) return res.status(404).json({ error: 'Registro no encontrado' });
      res.json(data);
    } catch (err) {
      console.error(`[crud:${tabla}] PUT`, err);
      res.status(400).json({ error: err.message || 'Error al actualizar registro' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const { error } = await supabase.from(tabla).update({ active: false }).eq('id', req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      console.error(`[crud:${tabla}] DELETE`, err);
      res.status(500).json({ error: 'Error al eliminar registro' });
    }
  });

  return router;
}

module.exports = { crudRouter };
