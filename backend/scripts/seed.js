/**
 * Script de seed: crea usuario admin, categorías, ingredientes,
 * productos y recetas iniciales del negocio de hamburguesas y burritos.
 * Uso: node scripts/seed.js   (requiere backend/.env configurado)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const config = require('../src/config');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false }
});

async function upsert(table, rows, onConflict = 'id') {
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table}: ${rows.length} filas`);
}

async function main() {
  console.log('Sembrando base de datos...\n');

  // 1. Usuario admin vía Supabase Auth (contraseña: admin123 — cambiar en producción)
  const { data: created, error: authErr } = await supabase.auth.admin.createUser({
    email: 'admin@negocio.com',
    password: 'admin123',
    email_confirm: true,
    user_metadata: { name: 'Administrador' }
  });
  if (authErr && !authErr.message.includes('already been registered')) {
    throw new Error(`auth.admin.createUser: ${authErr.message}`);
  }
  let adminId = created?.user?.id;
  if (!adminId) {
    const { data: list } = await supabase.auth.admin.listUsers();
    adminId = list?.users?.find(u => u.email === 'admin@negocio.com')?.id;
  }
  if (adminId) {
    // El perfil se crea/actualiza automáticamente en GET /api/auth/me;
    // aquí solo lo intentamos por adelantado (no bloquea si el esquema difiere).
    try {
      await supsert('users', [{
        id: adminId,
        name: 'Administrador',
        email: 'admin@negocio.com',
        role: 'admin',
        active: true
      }]);
    } catch (e) {
      console.log(`  users: omitido (${e.message}) — se creará en el primer inicio de sesión`);
    }
  }

  // 2. Categorías de producto
  const cats = [
    { name: 'Hamburguesas', description: 'Hamburguesas especiales Monster' },
    { name: 'Burritos', description: 'Burritos tradicionales y de la casa' },
    { name: 'Platillos', description: 'Platillos combinados' },
    { name: 'Acompañamientos', description: 'Papas, aros de cebolla, etc.' },
    { name: 'Bebidas', description: 'Refrescos, aguas y malteadas' }
  ];
  await upsert('categories', cats, 'name');

  // 3. Categorías de gastos
  await upsert('expense_categories', [
    { name: 'Insumos', description: 'Compra de ingredientes e insumos' },
    { name: 'Renta', description: 'Renta del local' },
    { name: 'Servicios', description: 'Luz, agua, internet' },
    { name: 'Nómina', description: 'Sueldos del personal' },
    { name: 'Otros', description: 'Gastos diversos' }
  ], 'name');

  // 4. Ingredientes (inventario inicial)
  const ingredients = [
    { name: 'Pan hamburguesa', unit: 'pz', stock: 100, min_stock: 20, cost_per_unit: 8 },
    { name: 'Carne de res', unit: 'kg', stock: 25, min_stock: 5, cost_per_unit: 120 },
    { name: 'Pollo', unit: 'kg', stock: 20, min_stock: 5, cost_per_unit: 90 },
    { name: 'Tortilla de harina', unit: 'pz', stock: 120, min_stock: 30, cost_per_unit: 6 },
    { name: 'Tortilla de maíz', unit: 'pz', stock: 100, min_stock: 25, cost_per_unit: 5 },
    { name: 'Queso americano', unit: 'kg', stock: 8, min_stock: 2, cost_per_unit: 180 },
    { name: 'Lechuga', unit: 'kg', stock: 6, min_stock: 1.5, cost_per_unit: 25 },
    { name: 'Tomate', unit: 'kg', stock: 5, min_stock: 1, cost_per_unit: 30 },
    { name: 'Cebolla', unit: 'kg', stock: 5, min_stock: 1, cost_per_unit: 22 },
    { name: 'Papas', unit: 'kg', stock: 40, min_stock: 10, cost_per_unit: 18 },
    { name: 'Spaghetti', unit: 'kg', stock: 15, min_stock: 4, cost_per_unit: 28 },
    { name: 'Aceite vegetal', unit: 'lt', stock: 15, min_stock: 4, cost_per_unit: 45 },
    { name: 'Refresco 600ml', unit: 'pz', stock: 60, min_stock: 12, cost_per_unit: 15 },
    { name: 'Agua embotellada', unit: 'pz', stock: 48, min_stock: 12, cost_per_unit: 12 },
    { name: 'Salsa especial', unit: 'lt', stock: 4, min_stock: 1, cost_per_unit: 60 }
  ];
  await upsert('ingredients', ingredients, 'name');

  // 5. Productos
  const { data: catRows } = await supabase.from('categories').select('id, name');
  const catId = n => catRows.find(c => c.name === n)?.id;
  const { data: ingRows } = await supabase.from('ingredients').select('id, name');
  const ingId = n => ingRows.find(i => i.name === n)?.id;

  // Productos principales del negocio (precios en MXN).
  // price: null = pendiente de configurar desde el módulo de Productos.
  const products = [
    { name: 'Burger Combo', description: 'Hamburguesa Monster acompañada de papas y soda', price: 155, category_id: catId('Hamburguesas') },
    { name: 'Burger Monster', description: 'Hamburguesa Monster acompañada de papas', price: 125, category_id: catId('Hamburguesas') },
    { name: 'Carne Asada', description: 'Platillo de carne asada tipo combo con soda y spaghetti', price: 200, category_id: catId('Platillos') },
    { name: 'Burrito Prensado', description: 'Burrito prensado con doble carne y queso', price: 70, category_id: catId('Burritos') },
    { name: 'Burrito Relleno', description: 'Burrito tradicional de res con verduras y salsa', price: 60, category_id: catId('Burritos') }
  ];
  // Upsert por producto: si la columna price aún es NOT NULL en la BD,
  // los productos sin precio se omiten hasta aplicar el ALTER del schema.
  for (const p of products) {
    const { error } = await supabase.from('products').upsert(p, { onConflict: 'name' });
    if (error) {
      console.log(`  products: "${p.name}" omitido (${error.message})`);
      if (error.message.includes('price')) {
        console.log('  >> Ejecuta en Supabase SQL Editor: ALTER TABLE products ALTER COLUMN price DROP NOT NULL;');
      }
    } else {
      console.log(`  products: "${p.name}" ${p.price == null ? '(sin precio)' : '$' + p.price}`);
    }
  }

  // Desactivar productos del seed anterior que ya no pertenecen al catálogo
  const keepNames = products.map(p => p.name);
  const { data: allProducts } = await supabase.from('products').select('id, name, active');
  const toDeactivate = (allProducts || []).filter(p => p.active && !keepNames.includes(p.name));
  for (const p of toDeactivate) {
    await supabase.from('products').update({ active: false }).eq('id', p.id);
  }
  if (toDeactivate.length) console.log(`  products: ${toDeactivate.length} desactivados (catálogo anterior)`);

  // 6. Recetas (cantidad de ingrediente por 1 producto)
  const { data: prods } = await supabase.from('products').select('id, name');
  const prodId = n => prods.find(p => p.name === n)?.id;

  const recipes = [
    // Carne Asada (carne + spaghetti + soda)
    [prodId('Carne Asada'), ingId('Carne de res'), 0.35],
    [prodId('Carne Asada'), ingId('Spaghetti'), 0.15],
    [prodId('Carne Asada'), ingId('Refresco 600ml'), 1],
    [prodId('Carne Asada'), ingId('Aceite vegetal'), 0.05],
    // Burger Monster (con papas)
    [prodId('Burger Monster'), ingId('Pan hamburguesa'), 1],
    [prodId('Burger Monster'), ingId('Carne de res'), 0.28],
    [prodId('Burger Monster'), ingId('Queso americano'), 0.07],
    [prodId('Burger Monster'), ingId('Lechuga'), 0.05],
    [prodId('Burger Monster'), ingId('Tomate'), 0.06],
    [prodId('Burger Monster'), ingId('Papas'), 0.18],
    [prodId('Burger Monster'), ingId('Aceite vegetal'), 0.1],
    // Burger Combo (+ soda)
    [prodId('Burger Combo'), ingId('Pan hamburguesa'), 1],
    [prodId('Burger Combo'), ingId('Carne de res'), 0.28],
    [prodId('Burger Combo'), ingId('Queso americano'), 0.07],
    [prodId('Burger Combo'), ingId('Lechuga'), 0.05],
    [prodId('Burger Combo'), ingId('Tomate'), 0.06],
    [prodId('Burger Combo'), ingId('Papas'), 0.18],
    [prodId('Burger Combo'), ingId('Refresco 600ml'), 1],
    [prodId('Burger Combo'), ingId('Aceite vegetal'), 0.1],
    // Burrito Relleno
    [prodId('Burrito Relleno'), ingId('Tortilla de harina'), 1],
    [prodId('Burrito Relleno'), ingId('Carne de res'), 0.2],
    [prodId('Burrito Relleno'), ingId('Queso americano'), 0.06],
    [prodId('Burrito Relleno'), ingId('Lechuga'), 0.04],
    [prodId('Burrito Relleno'), ingId('Tomate'), 0.05],
    [prodId('Burrito Relleno'), ingId('Cebolla'), 0.04],
    [prodId('Burrito Relleno'), ingId('Salsa especial'), 0.05],
    // Burrito Prensado
    [prodId('Burrito Prensado'), ingId('Tortilla de harina'), 1],
    [prodId('Burrito Prensado'), ingId('Carne de res'), 0.25],
    [prodId('Burrito Prensado'), ingId('Queso americano'), 0.1],
    [prodId('Burrito Prensado'), ingId('Salsa especial'), 0.06]
  ];

  // Limpiar recetas previas del seed y reinsertar
  await supabase.from('recipes').delete().not('product_id', 'is', null);
  const recipeRows = recipes.filter(([p, i]) => p && i).map(([product_id, ingredient_id, quantity]) => ({ product_id, ingredient_id, quantity }));
  const { error: recErr } = await supabase.from('recipes').insert(recipeRows);
  if (recErr) throw new Error(`recipes: ${recErr.message}`);
  console.log(`  recipes: ${recipeRows.length} filas`);

  // Cliente demo
  await upsert('customers', [{ name: 'Cliente Mostrador', phone: '', email: '', active: true }], 'name');

  console.log('\nListo. Login: admin@negocio.com / admin123');
}

main().catch(err => { console.error(err); process.exit(1); });
