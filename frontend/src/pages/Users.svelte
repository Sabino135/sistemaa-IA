<script>
  import { onMount } from 'svelte';
  import { api, fmtDate } from '../lib/api';
  import { user } from '../lib/store';

  const isAdmin = $user?.role === 'admin';
  const ROLE_LABELS = { admin: 'Administrador', cajero: 'Cajero', inventario: 'Inventario', cliente: 'Cliente (tienda)' };

  let users = [];
  let loading = true;
  let error = '';

  let showForm = false;
  let editing = null;
  let form = {};
  let saving = false;

  async function load() {
    loading = true; error = '';
    try {
      const all = await api('/users');
      users = all.filter(u => ['admin', 'cajero', 'inventario'].includes(u.role));
    }
    catch (e) { error = e.message; }
    loading = false;
  }

  function startNew() {
    editing = null;
    form = { name: '', email: '', password: '', role: 'cajero', active: true };
    showForm = true;
  }

  function startEdit(u) {
    editing = u;
    form = { name: u.name, email: u.email, password: '', role: u.role, active: !!u.active };
    showForm = true;
  }

  async function save() {
    saving = true; error = '';
    try {
      const body = { name: form.name, email: form.email, role: form.role, active: !!form.active };
      if (form.password) body.password = form.password;
      if (editing?.id) {
        await api(`/users/${editing.id}`, { method: 'PUT', body });
      } else {
        body.password = form.password;
        await api('/users', { method: 'POST', body });
      }
      showForm = false;
      await load();
    } catch (e) { error = e.message; }
    saving = false;
  }

  async function deactivate(u) {
    if (u.id === $user?.id) { error = 'No puedes desactivar tu propia cuenta'; return; }
    if (!confirm(`¿Desactivar al usuario "${u.name}"? No podrá iniciar sesión.`)) return;
    try { await api(`/users/${u.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { error = e.message; }
  }

  onMount(load);
</script>

<div class="toolbar">
  <h2 class="page-title" style="margin:0;flex:1">Usuarios y permisos</h2>
  {#if isAdmin}<button on:click={startNew}>+ Nuevo usuario</button>{/if}
</div>

{#if error}<div class="error-msg card">{error}</div>{/if}

{#if showForm}
  <div class="card">
    <h3>{editing?.id ? 'Editar usuario' : 'Nuevo usuario'}</h3>
    <p class="muted">{editing?.id ? 'Deja la contraseña vacía para conservar la actual.' : 'Se creará la cuenta de acceso (Supabase Auth) con esta contraseña.'}</p>
    <div class="grid cols-2">
      <div><label for="us-name">Nombre *</label><input id="us-name" bind:value={form.name} /></div>
      <div><label for="us-email">Email *</label><input id="us-email" type="email" bind:value={form.email} /></div>
      <div><label for="us-pass">Contraseña {editing?.id ? '(opcional)' : '*'}</label><input id="us-pass" type="password" bind:value={form.password} placeholder={editing?.id ? 'Sin cambios' : 'Mínimo 8 caracteres'} /></div>
      <div>
        <label for="us-role">Rol</label>
        <select id="us-role" bind:value={form.role}>
          <option value="admin">Administrador</option>
          <option value="cajero">Cajero</option>
          <option value="inventario">Inventario</option>
        </select>
      </div>
    </div>
    <label style="display:flex;gap:8px;align-items:center;font-weight:400">
      <input type="checkbox" bind:checked={form.active} style="width:auto;margin:0" /> Activo
    </label>
    <div class="flex">
      <button on:click={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      <button class="secondary" on:click={() => showForm = false}>Cancelar</button>
    </div>
  </div>
{/if}

<div class="card" style="overflow-x:auto">
  {#if loading}<p class="muted">Cargando…</p>
  {:else if users.length === 0}<p class="muted">Sin usuarios.</p>
  {:else}
    <table>
      <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Alta</th><th></th></tr></thead>
      <tbody>
        {#each users as u}
          <tr>
            <td><strong>{u.name}</strong>{#if u.id === $user?.id} <span class="badge">(tú)</span>{/if}</td>
            <td>{u.email}</td>
            <td><span class="badge">{ROLE_LABELS[u.role] || u.role}</span></td>
            <td><span class="badge {u.active ? 'ok' : 'warn'}">{u.active ? 'Activo' : 'Inactivo'}</span></td>
            <td>{fmtDate(u.created_at)}</td>
            <td style="white-space:nowrap">
              {#if isAdmin}
                <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={() => startEdit(u)}>Editar</button>
                {#if u.active && u.id !== $user?.id}
                  <button class="danger" style="padding:4px 10px;font-size:12px;margin-left:6px" on:click={() => deactivate(u)}>Desactivar</button>
                {/if}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if !isAdmin}
  <div class="card"><p class="muted">Solo los administradores pueden gestionar usuarios.</p></div>
{/if}
