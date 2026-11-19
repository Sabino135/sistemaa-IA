<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney } from '../lib/api';
  import { user } from '../lib/store';

  let products = [];
  let categories = [];
  let customers = [];
  let cart = [];           // [{product, qty}]
  let categoryFilter = '';
  let paymentMethod = 'cash';
  let amountReceived = '';
  let customerId = '';
  let error = '';
  let success = '';
  let processing = false;
  // Referencia única por intento de cobro: evita ventas duplicadas si el
  // usuario hace doble clic o se reintenta tras un error de red.
  let clientRef = crypto.randomUUID();

  const TAX_RATE = 0.16;

  $: filtered = categoryFilter ? products.filter(p => p.category_id === categoryFilter) : products;
  $: subtotal = cart.reduce((a, i) => a + (i.product.price ?? 0) * i.qty, 0);
  $: tax = subtotal * TAX_RATE;
  $: total = subtotal + tax;
  $: change = paymentMethod === 'cash' && amountReceived !== '' ? Number(amountReceived) - total : null;

  onMount(async () => {
    try {
      [products, categories, customers] = await Promise.all([
        api('/products'),
        api('/categories'),
        api('/customers')
      ]);
      // Venta rápida: #/pos?add=<product_id> (desde el Dashboard)
      const addId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('add');
      if (addId) {
        const p = products.find(x => x.id === addId && x.active);
        if (p) add(p);
      }
    } catch (e) { error = e.message; }
  });

  function add(p) {
    if (p.price == null) { error = `"${p.name}" no tiene precio configurado`; return; }
    const found = cart.find(i => i.product.id === p.id);
    if (found) found.qty++;
    else cart = [...cart, { product: p, qty: 1 }];
    error = ''; success = '';
  }

  function setQty(id, qty) {
    cart = cart.map(i => i.product.id === id ? { ...i, qty: Math.max(0, qty) } : i).filter(i => i.qty > 0);
  }

  async function checkout(allowNegative = false) {
    if (cart.length === 0) return;
    processing = true; error = ''; success = '';
    try {
      const sale = await api('/sales', {
        method: 'POST',
        body: {
          customer_id: customerId || null,
          payment_method: paymentMethod,
          amount_received: paymentMethod === 'cash' && amountReceived !== '' ? Number(amountReceived) : null,
          client_ref: clientRef,
          allow_negative_stock: allowNegative,
          items: cart.map(i => ({ product_id: i.product.id, quantity: i.qty }))
        }
      });
      success = `Venta registrada: ${fmtMoney(sale.sale.total)}`;
      cart = [];
      amountReceived = '';
      clientRef = crypto.randomUUID();
      // Recargar productos por si cambiaron precios/estado
      products = await api('/products');
    } catch (e) {
      // Stock insuficiente: el admin puede autorizar la venta en negativo
      if (e.status === 409 && e.data?.requires_override && $user?.role === 'admin') {
        const detalle = (e.data.shortages || []).map(s =>
          s.reason === 'sin_receta' ? `"${s.product}" sin receta` : `"${s.product}" (disp. ${s.available}, sol. ${s.needed})`
        ).join('; ');
        if (confirm(`Stock insuficiente: ${detalle}\n\n¿Autorizar la venta de todos modos?`)) {
          processing = false;
          return checkout(true);
        }
      }
      error = e.message;
    }
    processing = false;
  }
</script>

<h2 class="page-title">Punto de Venta</h2>
{#if error}<div class="error-msg card">{error}</div>{/if}
{#if success}<div class="card" style="border-color:var(--ok);color:var(--ok)">{success}</div>{/if}

<div class="pos-grid">
  <div>
    <div class="toolbar">
      <select bind:value={categoryFilter} style="width:auto">
        <option value="">Todas las categorías</option>
        {#each categories as c}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">
      {#each filtered as p}
        {#if p.active}
          <div class="card product-card" class:disabled={p.price == null} on:click={() => add(p)} role="button">
            <div><strong>{p.name}</strong></div>
            <div class="muted" style="font-size:12px;min-height:30px">{p.description || ''}</div>
            {#if p.price == null}
              <div class="price" style="color:var(--danger)">Precio pendiente</div>
            {:else}
              <div class="price">{fmtMoney(p.price)}</div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>

  <div class="card" style="height:fit-content;position:sticky;top:20px">
    <h3>Ticket actual</h3>
    {#if cart.length === 0}<p class="muted">Toca un producto para agregarlo.</p>
    {:else}
      {#each cart as item}
        <div class="cart-item">
          <span>{item.product.name}</span>
          <span class="flex">
            <button class="qty-btn" on:click={() => setQty(item.product.id, item.qty - 1)}>−</button>
            <strong style="min-width:24px;text-align:center">{item.qty}</strong>
            <button class="qty-btn" on:click={() => setQty(item.product.id, item.qty + 1)}>+</button>
            <span style="min-width:70px;text-align:right">{fmtMoney((item.product.price ?? 0) * item.qty)}</span>
          </span>
        </div>
      {/each}

      <div class="checkout-total">
        <div class="flex" style="justify-content:space-between"><span class="muted">Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
        <div class="flex" style="justify-content:space-between"><span class="muted">IVA (16%)</span><span>{fmtMoney(tax)}</span></div>
        <div class="flex" style="justify-content:space-between;font-size:22px"><strong>Total</strong><strong>{fmtMoney(total)}</strong></div>
      </div>

      <label>Cliente</label>
      <select bind:value={customerId}>
        <option value="">Mostrador</option>
        {#each customers as c}<option value={c.id}>{c.name}</option>{/each}
      </select>
      <label>Método de pago</label>
      <select bind:value={paymentMethod}>
        <option value="cash">Efectivo</option>
        <option value="card">Tarjeta</option>
        <option value="transfer">Transferencia</option>
      </select>
      {#if paymentMethod === 'cash'}
        <label>Efectivo recibido</label>
        <input type="number" min="0" step="0.01" bind:value={amountReceived} placeholder={total.toFixed(2)} />
        {#if change !== null && change >= 0}
          <p class="muted">Cambio: <strong style="color:var(--ok)">{fmtMoney(change)}</strong></p>
        {/if}
      {/if}
      <button style="width:100%;margin-top:8px" on:click={checkout} disabled={processing}>
        {processing ? 'Procesando…' : 'Cobrar'}
      </button>
      <button class="secondary" style="width:100%;margin-top:8px" on:click={() => cart = []}>Vaciar ticket</button>
    {/if}
  </div>
</div>
