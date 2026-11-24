<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../../lib/api';
  import { storeSettings } from '../../lib/storefront';
  import { supabase } from '../../lib/supabase';
  import { orderWhatsAppMessage } from '../../lib/whatsapp';
  import WhatsAppButton from '../../lib/WhatsAppButton.svelte';

  export let id;
  export let qs = '';

  const ORDER_STATUS = {
    received: 'Recibido', preparing: 'Preparando', ready: 'Listo',
    on_the_way: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado'
  };
  const PAY_STATUS = {
    pending: 'Pago pendiente', review: 'Pago en revisión', paid: 'Pago confirmado', rejected: 'Pago rechazado',
    cancelled: 'Pago cancelado', refunded: 'Reembolsado'
  };

  let order = null;
  let error = '';
  let notice = '';
  let uploadingProof = false;
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

  // Adjuntar comprobante de transferencia: sube el archivo al bucket público
  // payment-proofs y registra la URL en el pedido (pasa a "Pago en revisión").
  async function uploadProof(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !order) return;
    uploadingProof = true; error = ''; notice = '';
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `proofs/${order.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('payment-proofs').getPublicUrl(path);
      await api(`/store/orders/${id}/proof?token=${encodeURIComponent(token)}`, {
        method: 'PUT',
        body: { proof_url: data.publicUrl }
      });
      notice = 'Comprobante enviado. El negocio lo revisará pronto.';
      await load();
    } catch (err) { error = err.message; }
    uploadingProof = false;
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

    {#if order.payment_method === 'transfer' && ['pending', 'review', 'rejected'].includes(order.payment_status)}
      <div class="card" style="background:var(--panel2);margin-top:12px">
        <h4 style="margin-top:0">Comprobante de transferencia</h4>
        {#if order.payment_proof_url}
          <p><a href={order.payment_proof_url} target="_blank" rel="noopener">Ver comprobante enviado</a></p>
        {/if}
        <label class="secondary" style="display:inline-block;cursor:pointer;padding:8px 14px;border-radius:8px">
          {uploadingProof ? 'Subiendo…' : (order.payment_proof_url ? 'Reemplazar comprobante' : 'Adjuntar comprobante')}
          <input type="file" accept="image/*,application/pdf" style="display:none" disabled={uploadingProof} on:change={uploadProof} />
        </label>
        <p class="muted" style="font-size:12px;margin-top:6px">Foto o PDF del comprobante de tu transferencia.</p>
      </div>
    {/if}
    {#if notice}<p style="color:var(--ok);margin-top:10px">{notice}</p>{/if}
    <p class="muted">Este estado se actualiza automáticamente cada 20 segundos.</p>
  </div>
{/if}
