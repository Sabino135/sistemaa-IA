<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../../lib/api';
  import { storeSettings } from '../../lib/storefront';
  import { orderWhatsAppMessage } from '../../lib/whatsapp';
  import WhatsAppButton from '../../lib/WhatsAppButton.svelte';

  export let id;
  export let qs = '';

  const ORDER_STATUS = {
    received: 'Recibido', preparing: 'Preparando', ready: 'Listo',
    on_the_way: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado'
  };
  const PAY_STATUS = {
    pending: 'Pago pendiente', paid: 'Pagado', rejected: 'Rechazado',
    cancelled: 'Pago cancelado', refunded: 'Reembolsado'
  };

  let order = null;
  let error = '';
  let timer = null;

  const token = new URLSearchParams(qs).get('token') || '';
  const STEPS = ['received', 'preparing', 'ready', 'on_the_way', 'delivered'];
  $: stepIdx = order ? STEPS.indexOf(order.status) : -1;
  $: waMessage = order ? orderWhatsAppMessage({
    items: order.order_items || [],
    total: order.total,
    orderNumber: order.order_number,
    delivery: order.delivery_method === 'delivery' ? 'A domicilio' : 'Recoger en tienda'
  }) : '';

  async function load() {
    try {
      order = await api(`/store/orders/${id}?token=${encodeURIComponent(token)}`);
      error = '';
    } catch (e) { error = e.message; }
  }

  onMount(() => {
    load();
    timer = setInterval(load, 20000); // refresco automático del estado
  });
  onDestroy(() => clearInterval(timer));
</script>

<h2 class="page-title">Rastrear pedido</h2>
{#if error}<div class="error-msg card">{error}</div>{/if}
{#if !order && !error}<p class="muted">Cargando pedido…</p>
{:else if order}
  <div class="card">
    <div class="flex" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <h3>Pedido #{order.order_number ?? order.id.slice(0, 8)}</h3>
        <p class="muted">{fmtDate(order.created_at)}</p>
      </div>
      <div>
        <span class="badge {order.status === 'delivered' ? 'ok' : order.status === 'cancelled' ? 'err' : 'warn'}" style="font-size:14px">
          {ORDER_STATUS[order.status] || order.status}
        </span>
        <span class="badge {order.payment_status === 'paid' ? 'ok' : 'warn'}" style="font-size:14px;margin-left:6px">
          {PAY_STATUS[order.payment_status] || order.payment_status}
        </span>
      </div>
      <WhatsAppButton small phone={$storeSettings?.whatsapp || $storeSettings?.phone} message={waMessage} label="Contactar por WhatsApp" />
    </div>

    {#if order.status !== 'cancelled'}
      <div class="store-steps">
        {#each STEPS as s, i}
          <span class="store-step {i <= stepIdx ? 'done' : ''}">{ORDER_STATUS[s]}</span>
          {#if i < STEPS.length - 1}<span class="store-step-arrow">→</span>{/if}
        {/each}
      </div>
      {#if order.delivery_method === 'pickup' && order.status === 'ready'}
        <p class="muted">Tu pedido está listo para recoger.</p>
      {/if}
    {/if}

    <table>
      <thead><tr><th>Producto</th><th>Cant.</th><th>Total</th></tr></thead>
      <tbody>
        {#each order.order_items || [] as i}
          <tr><td>{i.name}</td><td>{i.quantity}</td><td>{fmtMoney(i.total)}</td></tr>
        {/each}
      </tbody>
    </table>

    <div class="checkout-total">
      <div class="flex" style="justify-content:space-between"><span class="muted">Subtotal</span><span>{fmtMoney(order.subtotal)}</span></div>
      {#if Number(order.delivery_fee) > 0}
        <div class="flex" style="justify-content:space-between"><span class="muted">Envío</span><span>{fmtMoney(order.delivery_fee)}</span></div>
      {/if}
      <div class="flex" style="justify-content:space-between"><span class="muted">IVA</span><span>{fmtMoney(order.tax)}</span></div>
      <div class="flex" style="justify-content:space-between;font-size:20px"><strong>Total</strong><strong>{fmtMoney(order.total)}</strong></div>
    </div>
    <p class="muted">Este estado se actualiza automáticamente cada 20 segundos.</p>
  </div>
{/if}
