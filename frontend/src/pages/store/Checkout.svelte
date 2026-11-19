<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney } from '../../lib/api';
  import { cart, clearCart } from '../../lib/cart';
  import { navigate } from '../../lib/store';
  import { supabase } from '../../lib/supabase';
  import { loadStoreSettings } from '../../lib/storefront';
  import { orderWhatsAppMessage } from '../../lib/whatsapp';
  import WhatsAppButton from '../../lib/WhatsAppButton.svelte';

  let settings = null;
  let loading = true;
  let submitting = false;
  let error = '';
  let result = null; // { order_number, id, guest_token, payment_method }

  let form = {
    customer_name: '', customer_phone: '', customer_email: '',
    delivery_method: 'pickup',
    delivery_address: '', delivery_notes: '',
    payment_method: 'cash'
  };
  let coords = null;       // {lat,lng}
  let zoneInfo = null;     // {covered, zone_name, delivery_fee}
  let locating = false;

  $: subtotal = $cart.reduce((a, i) => a + i.price * i.quantity, 0);
  $: tax = Math.round(subtotal * 0.16 * 100) / 100;
  $: deliveryFee = form.delivery_method === 'delivery' ? Number(zoneInfo?.delivery_fee ?? settings?.delivery_fee ?? 0) : 0;
  $: total = Math.round((subtotal + tax + deliveryFee) * 100) / 100;

  $: payMethods = settings ? Object.entries(settings.payment_methods || {}).filter(([, v]) => v).map(([k]) => k) : [];

  onMount(async () => {
    try {
      settings = await loadStoreSettings();
      if (!settings.pickup_enabled && settings.delivery_enabled) form.delivery_method = 'delivery';
      if (!settings.delivery_enabled && settings.pickup_enabled) form.delivery_method = 'pickup';
      const firstPay = payMethods[0];
      if (firstPay) form.payment_method = firstPay;
      // Precargar datos si hay sesión de cliente
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        try {
          const me = await api('/auth/me');
          if (me?.name) form.customer_name = me.name;
          if (me?.email) form.customer_email = me.email;
        } catch { /* invitado */ }
      }
    } catch (e) { error = e.message; }
    loading = false;
  });

  async function useMyLocation() {
    locating = true; error = ''; zoneInfo = null;
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }));
      coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      zoneInfo = await api('/store/delivery/check', { method: 'POST', body: coords });
      if (!zoneInfo.covered) error = 'Tu ubicación está fuera de la zona de entrega.';
    } catch (e) {
      error = e.code === 1 ? 'Permiso de ubicación denegado' : (e.message || 'No se pudo obtener la ubicación');
    }
    locating = false;
  }

  async function submit() {
    error = '';
    if ($cart.length === 0) { error = 'El carrito está vacío'; return; }
    if (form.customer_name.trim().length < 2) { error = 'Ingresa tu nombre'; return; }
    if (form.customer_phone.replace(/\D/g, '').length < 8) { error = 'Ingresa un teléfono válido'; return; }
    if (form.delivery_method === 'delivery' && !form.delivery_address.trim()) { error = 'Ingresa la dirección de entrega'; return; }
    if (form.delivery_method === 'delivery' && zoneInfo && !zoneInfo.covered) { error = 'Tu ubicación está fuera de la zona de entrega'; return; }

    submitting = true;
    try {
      const body = {
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        customer_email: form.customer_email.trim() || null,
        delivery_method: form.delivery_method,
        delivery_address: form.delivery_method === 'delivery' ? form.delivery_address.trim() : null,
        delivery_notes: form.delivery_notes.trim() || null,
        payment_method: form.payment_method,
        notes: null,
        items: $cart.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
      };
      if (coords) { body.delivery_lat = coords.lat; body.delivery_lng = coords.lng; }

      const res = await api('/store/orders', { method: 'POST', body });

      if (res.init_point) {
        // Mercado Pago: redirigir al checkout de MP
        clearCart();
        window.location.href = res.init_point;
        return;
      }
      result = {
        id: res.order.id,
        order_number: res.order.order_number,
        total: res.order.total,
        payment_method: res.order.payment_method,
        guest_token: res.guest_token,
        wa_message: orderWhatsAppMessage({
          items: $cart,
          total: res.order.total,
          orderNumber: res.order.order_number,
          delivery: form.delivery_method === 'delivery' ? 'A domicilio' : 'Recoger en tienda'
        })
      };
      clearCart();
    } catch (e) { error = e.message; }
    submitting = false;
  }
</script>

{#if loading}<p class="muted">Cargando…</p>
{:else if result}
  <div class="card store-confirm">
    <h2>¡Pedido confirmado!</h2>
    <p>Tu pedido <strong>#{result.order_number}</strong> fue registrado.</p>
    <p class="muted">Total: <strong>{fmtMoney(result.total)}</strong> · Pago: {result.payment_method}</p>
    {#if result.payment_method === 'transfer'}
      <div class="card" style="background:var(--panel2)">
        <h4>Datos para transferir</h4>
        {#if settings?.bank}
          <p>{settings.bank.bank_name} · {settings.bank.account_name}<br />
          CLABE: {settings.bank.clabe || settings.bank.account_number || '—'}</p>
          {#if settings.bank.instructions}<p class="muted">{settings.bank.instructions}</p>{/if}
        {/if}
        <p class="muted">Muestra tu número de pedido al transferir. El negocio confirmará tu pago.</p>
      </div>
    {:else if result.payment_method === 'cash'}
      <p class="muted">Paga en efectivo al recibir tu pedido o al recogerlo.</p>
    {/if}
    <div class="flex" style="flex-wrap:wrap">
      <button on:click={() => navigate(`/pedido/${result.id}?token=${result.guest_token}`)}>Rastrear mi pedido</button>
      <button class="secondary" on:click={() => navigate('/tienda')}>Volver al menú</button>
      <WhatsAppButton phone={settings?.whatsapp || settings?.phone} message={result.wa_message} label="Avisar por WhatsApp" />
    </div>
  </div>
{:else}
  <h2 class="page-title">Checkout</h2>
  {#if error}<div class="error-msg card">{error}</div>{/if}
  {#if $cart.length === 0}
    <div class="card"><p class="muted">Tu carrito está vacío.</p><button class="secondary" on:click={() => navigate('/tienda')}>Ver menú</button></div>
  {:else}
    <div class="grid cols-2">
      <div class="card">
        <h3>Resumen</h3>
        {#each $cart as i}
          <div class="cart-item">
            <span>{i.name} × {i.quantity}</span>
            <span>{fmtMoney(i.price * i.quantity)}</span>
          </div>
        {/each}
        <div class="checkout-total">
          <div class="flex" style="justify-content:space-between"><span class="muted">Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
          <div class="flex" style="justify-content:space-between"><span class="muted">IVA (16%)</span><span>{fmtMoney(tax)}</span></div>
          {#if form.delivery_method === 'delivery'}
            <div class="flex" style="justify-content:space-between"><span class="muted">Envío{zoneInfo?.zone_name ? ' (' + zoneInfo.zone_name + ')' : ''}</span><span>{fmtMoney(deliveryFee)}</span></div>
          {/if}
          <div class="flex" style="justify-content:space-between;font-size:22px"><strong>Total</strong><strong>{fmtMoney(total)}</strong></div>
        </div>
      </div>

      <div class="card">
        <h3>Tus datos</h3>
        <label for="co-name">Nombre *</label>
        <input id="co-name" bind:value={form.customer_name} />
        <label for="co-phone">Teléfono / WhatsApp *</label>
        <input id="co-phone" bind:value={form.customer_phone} />
        <label for="co-email">Email (opcional)</label>
        <input id="co-email" type="email" bind:value={form.customer_email} />

        <label>¿Cómo lo quieres?</label>
        <div class="flex" style="gap:8px;margin-bottom:10px">
          {#if settings?.delivery_enabled}
            <button type="button" class={form.delivery_method === 'delivery' ? '' : 'secondary'} style="flex:1" on:click={() => form.delivery_method = 'delivery'}>A domicilio</button>
          {/if}
          {#if settings?.pickup_enabled}
            <button type="button" class={form.delivery_method === 'pickup' ? '' : 'secondary'} style="flex:1" on:click={() => form.delivery_method = 'pickup'}>Recoger</button>
          {/if}
        </div>

        {#if form.delivery_method === 'delivery'}
          <label for="co-addr">Dirección de entrega *</label>
          <input id="co-addr" bind:value={form.delivery_address} placeholder="Calle, número, colonia, referencias…" />
          <button type="button" class="secondary" style="margin-top:6px" on:click={useMyLocation} disabled={locating}>
            {locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación'}
          </button>
          {#if coords}
            <p class="muted" style="font-size:12px">Ubicación capturada: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
          {/if}
          {#if zoneInfo?.covered}
            <p class="muted" style="font-size:12px">✓ Cobertura: {zoneInfo.zone_name || 'zona general'} — envío {fmtMoney(zoneInfo.delivery_fee)}</p>
          {:else if zoneInfo && !zoneInfo.covered}
            <p style="color:var(--danger);font-size:12px">✗ Fuera de la zona de entrega</p>
          {/if}
        {/if}

        <label for="co-notes">Notas (opcional)</label>
        <input id="co-notes" bind:value={form.delivery_notes} placeholder="Ej. sin cebolla, timbre…" />

        <label>Método de pago</label>
        <select bind:value={form.payment_method}>
          {#each payMethods as m}
            <option value={m}>
              {m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Mercado Pago'}
            </option>
          {/each}
        </select>

        <button style="width:100%;margin-top:14px" on:click={submit} disabled={submitting}>
          {submitting ? 'Enviando pedido…' : `Confirmar pedido · ${fmtMoney(total)}`}
        </button>
      </div>
    </div>
  {/if}
{/if}
