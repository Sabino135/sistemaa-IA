<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../lib/api';

  let sales = [];
  let error = '';
  let from = '';
  let to = '';
  let detail = null;

  async function load() {
    error = '';
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      sales = await api('/sales' + (qs.toString() ? `?${qs}` : ''));
    } catch (e) { error = e.message; }
  }

  async function openDetail(id) {
    try { detail = await api(`/sales/${id}`); }
    catch (e) { error = e.message; }
  }

  async function cancel(id) {
    if (!confirm('¿Cancelar esta venta? El inventario será reintegrado.')) return;
    try { await api(`/sales/${id}/cancel`, { method: 'POST' }); detail = null; load(); }
    catch (e) { error = e.message; }
  }

  onMount(load);
</script>

<h2 class="page-title">Ventas</h2>
{#if error}<div class="error-msg card">{error}</div>{/if}

<div class="toolbar">
  <label style="margin:0">Desde <input type="date" bind:value={from} style="width:auto;display:inline-block" /></label>
  <label style="margin:0">Hasta <input type="date" bind:value={to} style="width:auto;display:inline-block" /></label>
  <button class="secondary" on:click={load}>Filtrar</button>
</div>

<div class="grid cols-2">
  <div class="card" style="overflow-x:auto">
    <table>
      <thead><tr><th>Fecha</th><th>Cliente</th><th>Items</th><th>Total</th><th>Pago</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        {#each sales as s}
          <tr>
            <td>{fmtDate(s.created_at)}</td>
            <td>{s.customers?.name || 'Mostrador'}</td>
            <td>{(s.sale_items || []).reduce((a, i) => a + i.quantity, 0)}</td>
            <td>{fmtMoney(s.total)}</td>
            <td><span class="badge">{s.payment_method}</span></td>
            <td><span class="badge {s.status === 'completed' ? 'ok' : 'err'}">{s.status}</span></td>
            <td>
              <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={() => openDetail(s.id)}>Ver</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if detail}
    <div class="card">
      <div class="flex" style="justify-content:space-between">
        <h3>Venta #{detail.id.slice(0, 8)}</h3>
        <button class="secondary" on:click={() => detail = null}>Cerrar</button>
      </div>
      <p class="muted">{fmtDate(detail.created_at)} · {detail.users?.name} · {detail.customers?.name || 'Mostrador'}</p>
      <table>
        <thead><tr><th>Producto</th><th>Cant.</th><th>P.Unit</th><th>Total</th></tr></thead>
        <tbody>
          {#each detail.sale_items || [] as i}
            <tr><td>{i.products?.name}</td><td>{i.quantity}</td><td>{fmtMoney(i.unit_price)}</td><td>{fmtMoney(i.total)}</td></tr>
          {/each}
        </tbody>
      </table>
      <div class="checkout-total">
        <div class="flex" style="justify-content:space-between"><span class="muted">Subtotal</span><span>{fmtMoney(detail.subtotal)}</span></div>
        <div class="flex" style="justify-content:space-between"><span class="muted">IVA</span><span>{fmtMoney(detail.tax)}</span></div>
        <div class="flex" style="justify-content:space-between;font-size:20px"><strong>Total</strong><strong>{fmtMoney(detail.total)}</strong></div>
        {#if detail.amount_received}<p class="muted">Recibido: {fmtMoney(detail.amount_received)} · Cambio: {fmtMoney(detail.change_given)}</p>{/if}
      </div>
      {#if detail.status === 'completed'}
        <button class="danger" on:click={() => cancel(detail.id)}>Cancelar venta</button>
      {/if}
    </div>
  {/if}
</div>
