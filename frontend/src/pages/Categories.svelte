<script>
  import CrudPage from '../lib/CrudPage.svelte';

  const fields = [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'description', label: 'Descripción', type: 'textarea' },
    { name: 'active', label: 'Activo', type: 'checkbox' }
  ];
  const cols = [
    { key: 'name', label: 'Categoría' },
    { key: 'description', label: 'Descripción' },
    { key: 'active', label: 'Estado', badge: true }
  ];
</script>

<CrudPage endpoint="/categories" title="Categorías" columns={cols} fields={fields} />
