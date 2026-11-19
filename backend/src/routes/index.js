const { supabase } = require('../db/supabase');
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('./crud');
const authRoutes = require('./auth');
const inventoryRoutes = require('./inventory');
const salesRoutes = require('./sales');
const reportsRoutes = require('./reports');
const geofencesRoutes = require('./geofences');
const { router: storeRoutes } = require('./store');
const orderRoutes = require('./orders');
const storeWebhookRoutes = require('./store-webhooks');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/sales', salesRoutes);
router.use('/reports', reportsRoutes);
router.use('/geofences', geofencesRoutes);
// Tienda online: el webhook de pagos va ANTES de la tienda pública para que
// no lo intercepte ninguna otra ruta, y no requiere autenticación.
router.use('/store/webhooks', storeWebhookRoutes);
router.use('/store', storeRoutes);
router.use('/orders', orderRoutes);

// CRUDs protegidos: auth antes de las rutas CRUD
function authedCrud(config) {
  const r = express.Router();
  r.use(authRequired);
  r.use(crudRouter(config));
  return r;
}

router.use('/categories', authedCrud({
  tabla: 'categories',
  updatable: ['name', 'description', 'active']
}));

router.use('/products', authedCrud({
  tabla: 'products',
  select: '*, categories(name)',
  updatable: ['name', 'description', 'price', 'category_id', 'image_url', 'active']
}));

router.use('/ingredients', authedCrud({
  tabla: 'ingredients',
  updatable: ['name', 'unit', 'stock', 'min_stock', 'cost_per_unit', 'active']
}));

router.use('/customers', authedCrud({
  tabla: 'customers',
  updatable: ['name', 'phone', 'email', 'address', 'active']
}));

router.use('/expenses', authedCrud({
  tabla: 'expenses',
  select: '*, expense_categories(name)',
  updatable: ['description', 'amount', 'expense_date', 'category_id', 'payment_method', 'notes', 'active'],
  searchFields: ['description']
}));

router.use('/expense-categories', authedCrud({
  tabla: 'expense_categories',
  updatable: ['name', 'description', 'active']
}));

router.use('/users', authedCrud({
  tabla: 'users',
  select: 'id, name, email, role, active, created_at',
  updatable: ['name', 'email', 'role', 'active']
}));

module.exports = router;
