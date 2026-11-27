const { supabase } = require('../db/supabase');
const express = require('express');
const { staffRequired, roleOnly } = require('../middleware/auth');
const { logActivity } = require('../lib/activity');

const router = express.Router();
router.use(staffRequired);
router.use(roleOnly('admin'));

// Tablas incluidas en el respaldo (datos operativos, sin auth.users).
const TABLES = [
  'categories', 'products', 'ingredients', 'recipes', 'customers',
  'sales', 'sale_items', 'inventory_movements',
  'expense_categories', 'expenses',
  'orders', 'order_items', 'order_status_history',
  'delivery_zones', 'payment_methods', 'store_settings',
  'geofences', 'geofence_events', 'users', 'activity_log'
];

// GET /api/backup — exporta todas las tablas operativas en JSON.
// Solo admin. No incluye credenciales ni tokens.
router.get('/', async (req, res) => {
  try {
    const dump = { exported_at: new Date().toISOString(), tables: {} };
    for (const t of TABLES) {
      const { data, error } = await supabase.from(t).select('*').limit(100000);
      if (error) {
        // Tabla inexistente por migración pendiente: se omite, no aborta.
        console.warn(`[backup] ${t}: ${error.message}`);
        dump.tables[t] = { error: error.message };
        continue;
      }
      dump.tables[t] = data || [];
    }
    await logActivity(req, 'backup.export', 'system', null, {
      tables: Object.keys(dump.tables).length
    });
    res.setHeader('Content-Disposition', `attachment; filename="daenerys-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(dump);
  } catch (err) {
    console.error('[backup]', err);
    res.status(500).json({ error: 'Error al generar el respaldo' });
  }
});

module.exports = router;
