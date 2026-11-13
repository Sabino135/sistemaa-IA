<script>
  import CrudPage from '../lib/CrudPage.svelte';
  import { user } from '../lib/store';

  const fields = [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'role', label: 'Rol', type: 'select', options: [
      { value: 'admin', label: 'Administrador' },
      { value: 'cajero', label: 'Cajero' },
      { value: 'inventario', label: 'Inventario' }
    ]},
    { name: 'active', label: 'Activo', type: 'checkbox' }
  ];
  const cols = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Rol' },
    { key: 'active', label: 'Estado', badge: true }
  ];
</script>

{#if $user?.role === 'admin'}
  <CrudPage endpoint="/users" title="Usuarios" columns={cols} fields={fields} />
{:else}
  <div class="card"><p class="muted">Solo los administradores pueden gestionar usuarios.</p></div>
{/if}
