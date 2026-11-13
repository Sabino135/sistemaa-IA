<script>
  import CrudPage from '../lib/CrudPage.svelte';
  const fields = [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'phone', label: 'Teléfono' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'address', label: 'Dirección', type: 'textarea' },
    { name: 'active', label: 'Activo', type: 'checkbox' }
  ];
  const cols = [
    { key: 'name', label: 'Cliente' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'active', label: 'Estado', badge: true }
  ];
</script>

<CrudPage endpoint="/customers" title="Clientes" columns={cols} fields={fields} />
