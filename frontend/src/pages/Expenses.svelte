<script>
  import CrudPage from '../lib/CrudPage.svelte';
  const fields = [
    { name: 'description', label: 'Descripción', required: true, type: 'textarea' },
    { name: 'amount', label: 'Monto', type: 'number', required: true },
    { name: 'expense_date', label: 'Fecha', type: 'date', default: new Date().toISOString().slice(0, 10) },
    { name: 'category_id', label: 'Categoría', type: 'select', optionsFrom: { endpoint: '/expense-categories?active=true', labelKey: 'name', valueKey: 'id' } },
    { name: 'payment_method', label: 'Método de pago', type: 'select', default: 'cash', options: [
      { value: 'cash', label: 'Efectivo' },
      { value: 'card', label: 'Tarjeta' },
      { value: 'transfer', label: 'Transferencia' }
    ]},
    { name: 'notes', label: 'Notas', type: 'textarea' },
    { name: 'receipt_url', label: 'URL del comprobante (foto/archivo)' },
    { name: 'active', label: 'Activo', type: 'checkbox' }
  ];
  const cols = [
    { key: 'expense_date', label: 'Fecha', date: true },
    { key: 'description', label: 'Descripción' },
    { key: 'expense_categories.name', label: 'Categoría' },
    { key: 'amount', label: 'Monto', money: true },
    { key: 'payment_method', label: 'Pago' },
    { key: 'active', label: 'Estado', badge: true }
  ];
  const catFields = [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'description', label: 'Descripción', type: 'textarea' },
    { name: 'active', label: 'Activo', type: 'checkbox' }
  ];
  const catCols = [
    { key: 'name', label: 'Categoría' },
    { key: 'description', label: 'Descripción' },
    { key: 'active', label: 'Estado', badge: true }
  ];
</script>

<CrudPage endpoint="/expenses" title="Gastos" columns={cols} fields={fields} />
<CrudPage endpoint="/expense-categories" title="Categorías de gasto" columns={catCols} fields={catFields} />
