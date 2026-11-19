<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney } from '../../lib/api';
  import { cart, addToCart, setQty, cartCount } from '../../lib/cart';
  import { navigate } from '../../lib/store';

  let products = [];
  let categories = [];
  let loading = true;
  let error = '';
  let catFilter = '';
  let showCart = false;

  $: filtered = catFilter ? products.filter(p => p.categories?.name === catFilter) : products;
  $: subtotal = $cart.reduce((a, i) => a + i.price * i.quantity, 0);
  $: tax = subtotal * 0.16;
  $: total = subtotal + tax;

  onMount(async () => {
    try {
      products = await api('/store/products');
      // Categorías únicas derivadas del catálogo (el endpoint público no las expone)
      const seen = new Map();
      for (const p of products) {
        if (p.categories?.name && !seen.has(p.categories.name)) {
          seen.set(p.categories.name, p.categories.name);
        }
      }
      categories = [...seen.keys()];
    } catch (e) { error = e.message; }
    loading = false;
  });

  function qtyOf(id) { return $cart.find(i => i.product_id === id)?.quantity || 0; }
</script>

{#if loading}<p class="muted">Cargando menú…</p>
{:else if error}<div class="error-msg card">{error}</div>
{:else if products.length === 0}<div class="card"><p class="muted">El menú aún no está disponible.</p></div>
{:else}
  <div class="toolbar" style="flex-wrap:wrap">
    <button class={catFilter === '' ? '' : 'secondary'} style="padding:6px 14px" on:click={() => catFilter = ''}>Todo</button>
    {#each categories as c}
      <button class={catFilter === c ? '' : 'secondary'} style="padding:6px 14px" on:click={() => catFilter = c}>{c}</button>
    {/each}
    <span style="flex:1"></span>
    <button class="secondary" on:click={() => showCart = !showCart}>
      {showCart ? 'Ocultar' : 'Ver'} pedido ({$cartCount})
    </button>
  </div>

  <div class="store-grid">
    <div class="store-products">
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
        {#each filtered as p}
          <div class="card store-card">
            {#if p.image_url}
              <img src={p.image_url} alt={p.name} class="store-img" />
            {/if}
            <div class="store-card-body">
              <strong>{p.name}</strong>
              {#if p.categories?.name}<div class="muted" style="font-size:12px">{p.categories.name}</div>{/if}
              {#if p.description}<p class="muted" style="font-size:13px;min-height:38px">{p.description}</p>{/if}
              <div class="flex" style="justify-content:space-between;align-items:center;margin-top:8px">
                <span class="price">{fmtMoney(p.price)}</span>
                {#if qtyOf(p.id) > 0}
                  <span class="flex">
                    <button class="qty-btn" on:click={() => setQty(p.id, qtyOf(p.id) - 1)}>−</button>
                    <strong style="min-width:22px;text-align:center">{qtyOf(p.id)}</strong>
                    <button class="qty-btn" on:click={() => setQty(p.id, qtyOf(p.id) + 1)}>+</button>
                  </span>
                {:else}
                  <button style="padding:6px 14px;font-size:13px" on:click={() => addToCart(p)}>Agregar</button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    {#if showCart || window.innerWidth > 900}
      <aside class="card store-cart">
        <h3>Tu pedido</h3>
        {#if $cart.length === 0}
          <p class="muted">El carrito está vacío.</p>
        {:else}
          {#each $cart as i}
            <div class="cart-item">
              <span>{i.name}</span>
              <span class="flex">
                <button class="qty-btn" on:click={() => setQty(i.product_id, i.quantity - 1)}>−</button>
                <strong style="min-width:22px;text-align:center">{i.quantity}</strong>
                <button class="qty-btn" on:click={() => setQty(i.product_id, i.quantity + 1)}>+</button>
                <span style="min-width:64px;text-align:right">{fmtMoney(i.price * i.quantity)}</span>
              </span>
            </div>
          {/each}
          <div class="checkout-total">
            <div class="flex" style="justify-content:space-between"><span class="muted">Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
            <div class="flex" style="justify-content:space-between"><span class="muted">IVA (16%)</span><span>{fmtMoney(tax)}</span></div>
            <div class="flex" style="justify-content:space-between;font-size:20px"><strong>Total aprox.</strong><strong>{fmtMoney(total)}</strong></div>
            <p class="muted" style="font-size:12px">El envío se calcula en el checkout.</p>
          </div>
          <button style="width:100%" on:click={() => navigate('/tienda/checkout')}>Ir a pagar</button>
        {/if}
      </aside>
    {/if}
  </div>
{/if}
