<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../lib/api';
  import { user } from '../lib/store';
  import WhatsAppButton from '../lib/WhatsAppButton.svelte';

  const canWrite = ['admin', 'cajero', 'inventario'].includes($user?.role);

  let customers = [];
  let loading = true;
  let error = '';
  let search = '';

  let showForm = false;
  let editing = null;
  let form = {};
  let saving = false;

  let historyFor = null;   // cliente seleccionado
  let sales = [];
  let orders = [];
  let historyLoading = false;

  async function load() {
    loading = true; error = '';
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      customers = await api('/customers' + qs);
    } catch (e) { error = e.message; }
    loading = false;
  }

  function startNew() {
    editing = null;
    form = { name: '', phone: '', email: '', address: '', active: true };
    showForm = true;
  }

  function startEdit(c) {
    editing = c;
    form = { name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', active: !!c.active };
    showForm = true;
  }

  async function save() {
    saving = true; error = '';
    try {
      if (editing?.id) await api(`/customers/${editing.id}`, { method: 'PUT', body: form });
      else await api('/customers', { method: 'POST', body: form });
      showForm = false;
      await load();
    } catch (e) { error = e.message; }
    saving = false;
  }

  async function toggleActive(c) {
    try { await api(`/customers/${c.id}`, { method: 'PUT', body: { active: !c.active } }); await load(); }
    catch (e) { error = e.message; }
  }

  async function showHistory(c) {
    historyFor = c;
    sales = []; orders = [];
    historyLoading = true;
    try {
      [sales, orders] = await Promise.all([
        api(`/sales?customer_id=${c.id}`),
        api(`/orders?customer_id=${c.id}`)
      ]);
    } catch (e) { error = e.message; }
    historyLoading = false;
  }

  $: historyTotal = [...sales.filter(s => s.status === 'completed'), ...orders.filter(o => o.status !== 'cancelled')]
    .reduce((a, r) => a + Number(r.total || 0), 0);

  onMount(load);
</script>

<div class="toolbar">
  <h2 class="page-title" style="margin:0;flex:1">Clientes</h2>
  <input placeholder="Buscar…" bind:value={search} on:keydown={(e) => e.key === 'Enter' && load()} style="width:220px" />
  <button class="secondary" on:click={load}>Buscar</button>
  {#if canWrite}<button on:click={startNew}>+ Nuevo</button>{/if}
</div>

{#if error}<div class="error-msg card">{error}</div>{/if}

{#if showForm}
  <div class="card">
    <h3>{editing?.id ? 'Editar' : 'Nuevo'} cliente</h3>
    <div class="grid cols-2">
      <div><label for="cu-name">Nombre *</label><input id="cu-name" bind:value={form.name} /></div>
      <div><label for="cu-phone">Teléfono</label><input id="cu-phone" bind:value={form.phone} /></div>
      <div><label for="cu-email">Email</label><input id="cu-email" type="email" bind:value={form.email} /></div>
      <div><label for="cu-address">Dirección</label><input id="cu-address" bind:value={form.address} /></div>
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

<div class="grid cols-2">
  <div class="card" style="overflow-x:auto">
    {#if loading}<p class="muted">Cargando…</p>
    {:else if customers.length === 0}<p class="muted">Sin clientes registrados.</p>
    {:else}
      <table>
        <thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {#each customers as c}
            <tr>
              <td><strong>{c.name}</strong></td>
              <td>{c.phone || '—'}</td>
              <td>{c.email || '—'}</td>
              <td><span class="badge {c.active ? 'ok' : 'warn'}">{c.active ? 'Activo' : 'Inactivo'}</span></td>
              <td style="white-space:nowrap">
                <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={() => showHistory(c)}>Historial</button>
                {#if canWrite}
                  <button class="secondary" style="padding:4px 10px;font-size:12px;margin-left:6px" on:click={() => startEdit(c)}>Editar</button>
                  <button class="secondary" style="padding:4px 10px;font-size:12px;margin-left:6px" on:click={() => toggleActive(c)}>{c.active ? 'Desactivar' : 'Activar'}</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  {#if historyFor}
    <div class="card">
      <div class="flex" style="justify-content:space-between">
        <h3>Historial — {historyFor.name}</h3>
        <button class="secondary" on:click={() => historyFor = null}>Cerrar</button>
      </div>
      <p class="muted">{historyFor.phone || ''} {historyFor.email ? '· ' + historyFor.email : ''}</p>
      <WhatsAppButton small phone={historyFor.phone} message={`Hola ${historyFor.name || ''}, te escribimos de Daenerys.`} label="WhatsApp" />

      {#if historyLoading}<p class="muted">Cargando…</p>
      {:else}
        <h4>Compras presenciales ({sales.filter(s => s.status === 'completed').length})</h4>
        {#if sales.length === 0}<p class="muted">Sin compras registradas.</p>
        {:else}
          <table>
            <thead><tr><th>Fecha</th><th>Items</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody>
              {#each sales as s}
                <tr>
                  <td>{fmtDate(s.created_at)}</td>
                  <td>{(s.sale_items || []).reduce((a, i) => a + i.quantity, 0)}</td>
                  <td>{fmtMoney(s.total)}</td>
                  <td><span class="badge {s.status === 'completed' ? 'ok' : 'err'}">{s.status === 'completed' ? 'Completada' : 'Cancelada'}</span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

        <h4>Pedidos en línea ({orders.length})</h4>
        {#if orders.length === 0}<p class="muted">Sin pedidos en línea.</p>
        {:else}
          <table>
            <thead><tr><th>Pedido</th><th>Fecha</th><th>Entrega</th><th>Total</th><th>Estado</th><th>Pago</th></tr></thead>
            <tbody>
              {#each orders as o}
                <tr>
                  <td>#{o.order_number ?? o.id.slice(0, 8)}</td>
                  <td>{fmtDate(o.created_at)}</td>
                  <td>{o.delivery_method === 'delivery' ? 'Domicilio' : 'Recoger'}</td>
                  <td>{fmtMoney(o.total)}</td>
                  <td><span class="badge {o.status === 'delivered' ? 'ok' : o.status === 'cancelled' ? 'err' : 'warn'}">{o.status}</span></td>
                  <td><span class="badge {o.payment_status === 'paid' ? 'ok' : 'warn'}">{o.payment_status}</span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

        <p style="margin-top:12px"><strong>Total histórico: {fmtMoney(historyTotal)}</strong></p>
      {/if}
    </div>
  {/if}
</div>
