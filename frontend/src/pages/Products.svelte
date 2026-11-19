<script>
  import CrudPage from '../lib/CrudPage.svelte';
  const productFields = [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'description', label: 'Descripción', type: 'textarea' },
    { name: 'price', label: 'Precio MXN (vacío = pendiente)', type: 'number' },
    { name: 'cost', label: 'Costo MXN (para utilidad)', type: 'number' },
    { name: 'category_id', label: 'Categoría', type: 'select', optionsFrom: { endpoint: '/categories?active=true', labelKey: 'name', valueKey: 'id' } },
    { name: 'image_url', label: 'URL de imagen' },
    { name: 'track_inventory', label: 'Controlar inventario (requiere receta para venderse)', type: 'checkbox' },
    { name: 'active', label: 'Activo', type: 'checkbox' }
  ];
  const productCols = [
    { key: 'name', label: 'Producto' },
    { key: 'categories.name', label: 'Categoría' },
    { key: 'price', label: 'Precio', money: true },
    { key: 'cost', label: 'Costo', money: true },
    { key: 'track_inventory', label: 'Inventario', badge: true },
    { key: 'active', label: 'Estado', badge: true }
  ];
</script>

<CrudPage endpoint="/products" title="Productos"
  columns={productCols} fields={productFields} />
