const { supabase } = require('../db/supabase');
const express = require('express');
const { staffRequired, roleOnly } = require('../middleware/auth');

const router = express.Router();
router.use(staffRequired);

// GET /api/reports/dashboard — KPIs del negocio para el panel principal
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';
    const daysAgo14 = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);

    const [todaySales, monthSales, expensesToday, expensesMonth, lowStock, topProductsRaw, recentOrders] = await Promise.all([
      supabase.from('sales').select('id, total').eq('status', 'completed').gte('created_at', today),
      supabase.from('sales').select('total, created_at').eq('status', 'completed').gte('created_at', daysAgo14),
      supabase.from('expenses').select('amount').eq('active', true).eq('expense_date', today),
      supabase.from('expenses').select('amount').eq('active', true).gte('expense_date', monthStart),
      supabase.from('ingredients').select('id, name, unit, stock, min_stock').eq('active', true),
      supabase.from('sale_items').select('quantity, total, products(name), sales!inner(created_at)').gte('sales.created_at', monthStart).limit(2000),
      supabase.from('sales')
        .select('id, total, payment_method, status, created_at, customers(name), users(name), sale_items(quantity)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(8)
    ]);

    const sum = rows => (rows.data || []).reduce((a, r) => a + Number(r.total || r.amount || 0), 0);
    const todayRows = todaySales.data || [];
    const todayTotal = sum(todaySales);
    const todayOrders = todayRows.length;

    // Unidades vendidas hoy
    const todayIds = todayRows.map(s => s.id);
    let todayUnits = 0;
    if (todayIds.length) {
      const { data: todayItems } = await supabase
        .from('sale_items').select('quantity').in('sale_id', todayIds).limit(2000);
      todayUnits = (todayItems || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0);
    }

    const monthRows = (monthSales.data || []).filter(s => s.created_at.slice(0, 10) >= monthStart);
    const monthTotal = monthRows.reduce((a, s) => a + Number(s.total), 0);
    const monthExpenses = sum(expensesMonth);
    const todayExpenses = sum(expensesToday);
    const low = (lowStock.data || []).filter(i => i.min_stock != null && i.stock <= i.min_stock);

    // Top productos del mes
    const prodMap = {};
    for (const it of topProductsRaw.data || []) {
      const name = it.products?.name || 'Desconocido';
      prodMap[name] = prodMap[name] || { name, quantity: 0, total: 0 };
      prodMap[name].quantity += Number(it.quantity) || 0;
      prodMap[name].total += Number(it.total) || 0;
    }
    const top = Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 10);

    // Ventas por día: últimos 14 días (completa días sin ventas con 0)
    const byDay = {};
    for (const s of monthSales.data || []) {
      const d = s.created_at.slice(0, 10);
      byDay[d] = (byDay[d] || 0) + Number(s.total);
    }
    const salesByDay = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      salesByDay.push({ date: d, total: byDay[d] || 0 });
    }

    const recent = (recentOrders.data || []).map(s => ({
      id: s.id,
      total: Number(s.total) || 0,
      payment_method: s.payment_method,
      status: s.status,
      created_at: s.created_at,
      customer: s.customers?.name || 'Mostrador',
      user: s.users?.name || '—',
      items: (s.sale_items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0)
    }));

    res.json({
      today: {
        total: todayTotal,
        orders: todayOrders,
        units: todayUnits,
        avgTicket: todayOrders ? todayTotal / todayOrders : 0,
        expenses: todayExpenses,
        profit: todayTotal - todayExpenses
      },
      month: { total: monthTotal, expenses: monthExpenses, profit: monthTotal - monthExpenses },
      salesByDay,
      topProducts: top,
      recentOrders: recent,
      lowStockCount: low.length,
      lowStock: low,
      // Compatibilidad con versiones anteriores del frontend
      todayTotal,
      monthTotal,
      monthExpenses,
      monthProfit: monthTotal - monthExpenses
    });
  } catch (err) {
    console.error('[reports/dashboard]', err);
    res.status(500).json({ error: 'Error al generar dashboard' });
  }
});

// GET /api/reports/sales — ventas agregadas por rango
router.get('/sales', async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = supabase.from('sales').select('total, tax, payment_method, status, created_at').eq('status', 'completed');
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to + 'T23:59:59');
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar reporte de ventas' });
  }
});

// GET /api/reports/expenses
router.get('/expenses', async (req, res) => {
  try {
    const { from, to, category_id } = req.query;
    let q = supabase.from('expenses').select('*, expense_categories(name)').eq('active', true).order('expense_date', { ascending: false });
    if (from) q = q.gte('expense_date', from);
    if (to) q = q.lte('expense_date', to);
    if (category_id) q = q.eq('category_id', category_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar gastos' });
  }
});

// GET /api/reports/profitability — rentabilidad estimada
router.get('/profitability', roleOnly('admin'), async (req, res) => {
  try {
    const monthStart = new Date().toISOString().slice(0, 8) + '01';
    const { data: sales } = await supabase.from('sales').select('total').eq('status', 'completed').gte('created_at', monthStart);
    const { data: expenses } = await supabase.from('expenses').select('amount').eq('active', true).gte('expense_date', monthStart);
    const { data: ings } = await supabase.from('ingredients').select('stock, cost_per_unit').eq('active', true);

    const revenue = (sales || []).reduce((a, s) => a + Number(s.total), 0);
    const expenseTotal = (expenses || []).reduce((a, e) => a + Number(e.amount), 0);
    const inventoryValue = (ings || []).reduce((a, i) => a + Number(i.stock || 0) * Number(i.cost_per_unit || 0), 0);

    res.json({
      revenue,
      expenses: expenseTotal,
      profit: revenue - expenseTotal,
      margin: revenue > 0 ? ((revenue - expenseTotal) / revenue * 100).toFixed(1) : 0,
      inventoryValue
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al calcular rentabilidad' });
  }
});

// GET /api/reports/products — productos más vendidos en un rango
router.get('/products', async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = supabase
      .from('sale_items')
      .select('quantity, total, unit_price, products(id, name, price, cost), sales!inner(created_at, status)')
      .eq('sales.status', 'completed');
    if (from) q = q.gte('sales.created_at', from);
    if (to) q = q.lte('sales.created_at', to + 'T23:59:59');
    const { data, error } = await q.limit(5000);
    if (error) throw error;

    const map = {};
    for (const it of data || []) {
      const p = it.products || {};
      const key = p.id || 'sin-producto';
      map[key] = map[key] || {
        product_id: p.id || null,
        name: p.name || 'Desconocido',
        quantity: 0, revenue: 0, cost: 0
      };
      const qty = Number(it.quantity) || 0;
      map[key].quantity += qty;
      map[key].revenue += Number(it.total) || 0;
      map[key].cost += qty * Number(p.cost || 0);
    }
    const rows = Object.values(map)
      .map(r => ({ ...r, profit: r.revenue - r.cost }))
      .sort((a, b) => b.revenue - a.revenue);
    res.json(rows);
  } catch (err) {
    console.error('[reports/products]', err);
    res.status(500).json({ error: 'Error al generar reporte de productos' });
  }
});

// GET /api/reports/customers — clientes con historial de compras
router.get('/customers', async (req, res) => {
  try {
    const { from, to } = req.query;
    let q = supabase.from('sales').select('id, total, created_at, customer_id, customers(name, phone, email)')
      .eq('status', 'completed');
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to + 'T23:59:59');
    const { data: sales, error } = await q.limit(5000);
    if (error) throw error;

    // Pedidos web del mismo rango (canal online)
    let oq = supabase.from('orders').select('id, total, created_at, customer_id, customer_name, payment_status')
      .neq('status', 'cancelled');
    if (from) oq = oq.gte('created_at', from);
    if (to) oq = oq.lte('created_at', to + 'T23:59:59');
    const { data: orders } = await oq.limit(5000);

    const map = {};
    const bucket = key => map[key] = map[key] || { name: '', phone: '', purchases: 0, total: 0, orders: 0, orders_total: 0 };
    for (const s of sales || []) {
      const key = s.customer_id || `walkin-${s.id}`;
      const b = bucket(key);
      b.name = s.customers?.name || 'Mostrador';
      b.phone = s.customers?.phone || '';
      b.purchases += 1;
      b.total += Number(s.total) || 0;
    }
    for (const o of orders || []) {
      const key = o.customer_id || `web-${o.id}`;
      const b = bucket(key);
      b.name = o.customer_name || b.name || 'Cliente web';
      b.orders += 1;
      b.orders_total += Number(o.total) || 0;
      b.total += Number(o.total) || 0;
    }
    const rows = Object.values(map).sort((a, b) => b.total - a.total);
    res.json(rows);
  } catch (err) {
    console.error('[reports/customers]', err);
    res.status(500).json({ error: 'Error al generar reporte de clientes' });
  }
});

// GET /api/reports/inventory — valuación y alertas de inventario
router.get('/inventory', async (req, res) => {
  try {
    const { data: ings, error } = await supabase
      .from('ingredients')
      .select('id, name, unit, stock, min_stock, cost_per_unit, active');
    if (error) throw error;
    const rows = (ings || []).map(i => ({
      ...i,
      stock_value: Math.round(Number(i.stock || 0) * Number(i.cost_per_unit || 0) * 100) / 100,
      low: i.min_stock != null && Number(i.stock) <= Number(i.min_stock)
    }));
    res.json({
      items: rows.filter(r => r.active),
      total_value: rows.filter(r => r.active).reduce((a, r) => a + r.stock_value, 0),
      low_stock: rows.filter(r => r.active && r.low)
    });
  } catch (err) {
    console.error('[reports/inventory]', err);
    res.status(500).json({ error: 'Error al generar reporte de inventario' });
  }
});

// GET /api/reports/summary — consolidado ventas/gastos/utilidad por rango
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    let sq = supabase.from('sales').select('total').eq('status', 'completed');
    let eq = supabase.from('expenses').select('amount').eq('active', true);
    if (from) { sq = sq.gte('created_at', from); eq = eq.gte('expense_date', from); }
    if (to) { sq = sq.lte('created_at', to + 'T23:59:59'); eq = eq.lte('expense_date', to); }
    const [{ data: sales }, { data: expenses }] = await Promise.all([sq, eq]);
    const revenue = (sales || []).reduce((a, s) => a + Number(s.total), 0);
    const expenseTotal = (expenses || []).reduce((a, e) => a + Number(e.amount), 0);
    res.json({
      revenue: Math.round(revenue * 100) / 100,
      expenses: Math.round(expenseTotal * 100) / 100,
      profit: Math.round((revenue - expenseTotal) * 100) / 100,
      sales_count: (sales || []).length,
      expenses_count: (expenses || []).length
    });
  } catch (err) {
    console.error('[reports/summary]', err);
    res.status(500).json({ error: 'Error al generar resumen' });
  }
});

module.exports = router;
