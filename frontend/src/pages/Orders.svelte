<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../lib/api';
  import { user } from '../lib/store';
  import WhatsAppButton from '../lib/WhatsAppButton.svelte';

  const ORDER_STATUS = {
    received: 'Pendiente', preparing: 'En preparación', ready: 'Listo para entregar',
    on_the_way: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado'
  };
  const PAY_STATUS = {
    pending: 'Pago pendiente', review: 'Pago en revisión', paid: 'Pago confirmado', rejected: 'Pago rechazado',
    cancelled: 'Pago cancelado', refunded: 'Reembolsado'
  };
  const PAY_METHOD = { mercadopago: 'Mercado Pago', transfer: 'Transferencia', cash: 'Efectivo' };
  const DELIVERY = { delivery: 'A domicilio', pickup: 'Recoger' };

  let orders = [];
  let loading = true;
  let error = '';
  let detail = null;

  let fStatus = '';
  let fPay = '';
  let fMethod = '';
  let fDelivery = '';
  let fFrom = '';
  let fTo = '';
  let fQ = '';

  async function load() {
    loading = true; error = '';
    try {
      const qs = new URLSearchParams();
      if (fStatus) qs.set('status', fStatus);
      if (fPay) qs.set('payment_status', fPay);
      if (fMethod) qs.set('payment_method', fMethod);
      if (fDelivery) qs.set('delivery_method', fDelivery);
      if (fFrom) qs.set('from', fFrom);
      if (fTo) qs.set('to', fTo);
      if (fQ) qs.set('q', fQ);
      orders = await api('/orders' + (qs.toString() ? `?${qs}` : ''));
    } catch (e) { error = e.message; }
    loading = false;
  }

  async function openDetail(id) {
    try { detail = await api(`/orders/${id}`); }
    catch (e) { error = e.message; }
  }

  async function setStatus(id, status) {
    try {
      await api(`/orders/${id}/status`, { method: 'PUT', body: { status } });
      if (detail?.id === id) detail = await api(`/orders/${id}`);
      await load();
    } catch (e) {
      // Stock insuficiente al entregar: ofrecer override si es admin
      if (e.status === 409 && e.data?.requires_override && $user?.role === 'admin') {
        if (confirm(e.message + '\n\n¿Autorizar la entrega de todos modos?')) {
          try {
            await api(`/orders/${id}/status`, { method: 'PUT', body: { status, allow_negative_stock: true } });
            if (detail?.id === id) detail = await api(`/orders/${id}`);
            await load();
            return;
          } catch (e2) { error = e2.message; }
        }
      } else {
        error = e.message;
      }
    }
  }

  async function setPayment(id, payment_status) {
    try {
      await api(`/orders/${id}/payment`, { method: 'PUT', body: { payment_status } });
      if (detail?.id === id) detail = await api(`/orders/${id}`);
      await load();
    } catch (e) { error = e.message; }
  }

  onMount(load);
</script>

<h2 class="page-title">Pedidos en línea</h2>
{#if error}<div class="error-msg card">{error}</div>{/if}

<div class="toolbar" style="flex-wrap:wrap">
  <select bind:value={fStatus} on:change={load} style="width:auto">
    <option value="">Todos los estados</option>
    {#each Object.entries(ORDER_STATUS) as [v, l]}<option value={v}>{l}</option>{/each}
  </select>
  <select bind:value={fPay} on:change={load} style="width:auto">
    <option value="">Todos los pagos</option>
    {#each Object.entries(PAY_STATUS) as [v, l]}<option value={v}>{l}</option>{/each}
  </select>
  <select bind:value={fMethod} on:change={load} style="width:auto">
    <option value="">Todos los métodos</option>
    {#each Object.entries(PAY_METHOD) as [v, l]}<option value={v}>{l}</option>{/each}
  </select>
  <select bind:value={fDelivery} on:change={load} style="width:auto">
    <option value="">Entrega y recoger</option>
    {#each Object.entries(DELIVERY) as [v, l]}<option value={v}>{l}</option>{/each}
  </select>
  <input type="date" bind:value={fFrom} on:change={load} style="width:auto" title="Desde" />
  <input type="date" bind:value={fTo} on:change={load} style="width:auto" title="Hasta" />
  <input placeholder="Cliente o teléfono…" bind:value={fQ} on:keydown={(e) => e.key === 'Enter' && load()} style="width:200px" />
  <button class="secondary" on:click={load}>Filtrar</button>
</div>

<div class="grid cols-2">
  <div class="card" style="overflow-x:auto">
    {#if loading}<p class="muted">Cargando…</p>
    {:else if orders.length === 0}<p class="muted">Sin pedidos con esos filtros.</p>
    {:else}
      <table>
        <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th>Total</th><th>Estado</th><th>Pago</th><th></th></tr></thead>
        <tbody>
          {#each orders as o}
            <tr>
              <td><strong>#{o.order_number ?? o.id.slice(0, 8)}</strong></td>
              <td>{fmtDate(o.created_at)}</td>
              <td>{o.customer_name}<br /><span class="muted" style="font-size:12px">{o.customer_phone}</span></td>
              <td>{DELIVERY[o.delivery_method] || o.delivery_method}</td>
              <td>{fmtMoney(o.total)}</td>
              <td><span class="badge {o.status === 'delivered' ? 'ok' : o.status === 'cancelled' ? 'err' : 'warn'}">{ORDER_STATUS[o.status] || o.status}</span></td>
              <td><span class="badge {o.payment_status === 'paid' ? 'ok' : o.payment_status === 'pending' ? 'warn' : 'err'}">{PAY_STATUS[o.payment_status] || o.payment_status}</span></td>
              <td><button class="secondary" style="padding:4px 10px;font-size:12px" on:click={() => openDetail(o.id)}>Ver</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  {#if detail}
    <div class="card">
      <div class="flex" style="justify-content:space-between">
        <h3>Pedido #{detail.order_number ?? detail.id.slice(0, 8)}</h3>
        <button class="secondary" on:click={() => detail = null}>Cerrar</button>
      </div>
      <p class="muted">{fmtDate(detail.created_at)}</p>

      <h4>Cliente</h4>
      <p><strong>{detail.customer_name}</strong> · {detail.customer_phone}{#if detail.customer_email}<br />{detail.customer_email}{/if}</p>
      <WhatsAppButton small phone={detail.customer_phone} message={`Hola ${detail.customer_name || ''}, te escribimos por tu pedido #${detail.order_number ?? detail.id.slice(0, 8)}.`} label="WhatsApp cliente" />
      {#if detail.delivery_method === 'delivery'}
        <p class="muted">Entrega a domicilio{#if detail.delivery_address}: {detail.delivery_address}{/if}{#if detail.delivery_notes}<br />Notas: {detail.delivery_notes}{/if}</p>
      {:else}
        <p class="muted">Recoger en establecimiento</p>
      {/if}

      <h4>Productos</h4>
      <table>
        <thead><tr><th>Producto</th><th>Cant.</th><th>P.Unit</th><th>Total</th></tr></thead>
        <tbody>
          {#each detail.order_items || [] as i}
            <tr><td>{i.name}</td><td>{i.quantity}</td><td>{fmtMoney(i.unit_price)}</td><td>{fmtMoney(i.total)}</td></tr>
          {/each}
        </tbody>
      </table>

      <div class="checkout-total">
        <div class="flex" style="justify-content:space-between"><span class="muted">Subtotal</span><span>{fmtMoney(detail.subtotal)}</span></div>
        {#if Number(detail.delivery_fee) > 0}
          <div class="flex" style="justify-content:space-between"><span class="muted">Envío</span><span>{fmtMoney(detail.delivery_fee)}</span></div>
        {/if}
        <div class="flex" style="justify-content:space-between"><span class="muted">IVA</span><span>{fmtMoney(detail.tax)}</span></div>
        <div class="flex" style="justify-content:space-between;font-size:20px"><strong>Total</strong><strong>{fmtMoney(detail.total)}</strong></div>
      </div>

      <h4>Estado del pedido</h4>
      <div class="flex" style="flex-wrap:wrap;gap:8px">
        {#each Object.entries(ORDER_STATUS) as [v, l]}
          <button
            class={detail.status === v ? '' : 'secondary'}
            style="padding:6px 12px;font-size:13px"
            disabled={detail.status === v}
            on:click={() => setStatus(detail.id, v)}>{l}</button>
        {/each}
      </div>
      {#if detail.sale_id}<p class="muted" style="margin-top:6px">Venta POS vinculada: #{detail.sale_id.slice(0, 8)}</p>{/if}

      <h4>Estado del pago</h4>
      <div class="flex" style="flex-wrap:wrap;gap:8px">
        {#each Object.entries(PAY_STATUS) as [v, l]}
          <button
            class={detail.payment_status === v ? '' : 'secondary'}
            style="padding:6px 12px;font-size:13px"
            disabled={detail.payment_status === v}
            on:click={() => setPayment(detail.id, v)}>{l}</button>
        {/each}
      </div>
      <p class="muted">Método: {PAY_METHOD[detail.payment_method] || detail.payment_method}{#if detail.payment_reference} · Ref: {detail.payment_reference}{/if}</p>
      {#if detail.payment_proof_url}
        <p><a href={detail.payment_proof_url} target="_blank" rel="noopener">Ver comprobante de pago</a></p>
      {/if}
    </div>
  {/if}
</div>
