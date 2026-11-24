const { supabase } = require('../db/supabase');
const express = require('express');
const { authRequired, requireRole } = require('../middleware/auth');
const { crudRouter } = require('./crud');
const authRoutes = require('./auth');
const inventoryRoutes = require('./inventory');
const salesRoutes = require('./sales');
const reportsRoutes = require('./reports');
const geofencesRoutes = require('./geofences');
const { router: storeRoutes } = require('./store');
const orderRoutes = require('./orders');
const usersRoutes = require('./users');
const deliveryZonesRoutes = require('./delivery-zones');
const paymentMethodsRoutes = require('./payment-methods');
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
router.use('/delivery-zones', deliveryZonesRoutes);
router.use('/payment-methods', paymentMethodsRoutes);

// CRUDs protegidos: cualquier miembro del equipo puede LEER;
// las escrituras (POST/PUT/DELETE) exigen rol según writeRoles
// (por defecto solo admin; se puede ampliar por recurso).
function authedCrud(config) {
  const writeRoles = config.writeRoles || ['admin'];
  const r = express.Router();
  r.use(authRequired);
  r.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !writeRoles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    next();
  });
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
  updatable: ['name', 'description', 'price', 'cost', 'category_id', 'image_url', 'active', 'track_inventory', 'featured']
}));

router.use('/ingredients', authedCrud({
  tabla: 'ingredients',
  updatable: ['name', 'unit', 'stock', 'min_stock', 'cost_per_unit', 'active'],
  writeRoles: ['admin', 'inventario']
}));

router.use('/customers', authedCrud({
  tabla: 'customers',
  updatable: ['name', 'phone', 'email', 'address', 'active'],
  writeRoles: ['admin', 'cajero', 'inventario']
}));

router.use('/expenses', authedCrud({
  tabla: 'expenses',
  select: '*, expense_categories(name)',
  updatable: ['description', 'amount', 'expense_date', 'category_id', 'payment_method', 'notes', 'receipt_url', 'active'],
  searchFields: ['description']
}));

router.use('/expense-categories', authedCrud({
  tabla: 'expense_categories',
  updatable: ['name', 'description', 'active']
}));

// Usuarios: ruta dedicada porque crea cuentas reales en Supabase Auth
// (admin.createUser), no solo filas en public.users.
router.use('/users', usersRoutes);

module.exports = router;
