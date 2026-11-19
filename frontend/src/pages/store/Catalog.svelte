<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney } from '../../lib/api';
  import { cart, addToCart, setQty, cartCount } from '../../lib/cart';
  import { navigate } from '../../lib/store';
  import { storeSettings, loadStoreSettings } from '../../lib/storefront';
  import { orderWhatsAppMessage } from '../../lib/whatsapp';
  import WhatsAppButton from '../../lib/WhatsAppButton.svelte';

  let products = [];
  let categories = [];
  let loading = true;
  let error = '';
  let catFilter = '';
  let query = '';
  let sort = 'destacados';

  $: q = query.trim().toLowerCase();
  $: base = products.filter(p => {
    const cat = p.categories?.name || '';
    const hay = `${p.name || ''} ${p.description || ''} ${cat}`.toLowerCase();
    return (!catFilter || cat === catFilter) && (!q || hay.includes(q));
  });
  $: filtered = [...base].sort((a, b) => {
    if (sort === 'price_asc') return Number(a.price || 0) - Number(b.price || 0);
    if (sort === 'price_desc') return Number(b.price || 0) - Number(a.price || 0);
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    return 0;
  });
  $: subtotal = $cart.reduce((a, i) => a + i.price * i.quantity, 0);
  $: tax = subtotal * 0.16;
  $: total = subtotal + tax;
  $: waMessage = orderWhatsAppMessage({ items: $cart, total });
  $: storePhone = $storeSettings?.whatsapp || $storeSettings?.phone || '';

  onMount(async () => {
    try {
      await loadStoreSettings();
      products = await api('/store/products');
      const seen = new Map();
      for (const p of products) {
        const name = p.categories?.name;
        if (name && !seen.has(name)) seen.set(name, name);
      }
      categories = [...seen.keys()];
    } catch (e) { error = e.message; }
    loading = false;
  });

  function qtyOf(id) { return $cart.find(i => i.product_id === id)?.quantity || 0; }
  function scrollToMenu() { document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
</script>

<section class="store-hero">
  <div>
    <h1>{$storeSettings?.store_name || 'Daenerys'}</h1>
    <p>{$storeSettings?.store_tagline || 'Hamburguesas · Burritos · Carne asada'}</p>
    <div class="flex" style="margin-top:14px;flex-wrap:wrap">
      <button on:click={scrollToMenu}>Ver menú</button>
      <WhatsAppButton phone={storePhone} label="Pedir por WhatsApp" secondary={false} />
    </div>
    {#if $storeSettings?.address}<p class="muted" style="margin-top:10px">{$storeSettings.address}</p>{/if}
  </div>
</section>

{#if loading}<p class="muted">Cargando menú…</p>
{:else if error}<div class="error-msg card">{error}</div>
{:else if products.length === 0}<div class="card"><p class="muted">El menú aún no está disponible.</p></div>
{:else}
  <div class="store-controls" id="menu">
    <input class="store-search" type="search" placeholder="Buscar hamburguesa, burrito, bebida…" bind:value={query} />
    <select class="store-sort" bind:value={sort}>
      <option value="destacados">Destacados</option>
      <option value="price_asc">Precio: menor a mayor</option>
      <option value="price_desc">Precio: mayor a menor</option>
      <option value="name">Nombre A-Z</option>
    </select>
  </div>

  <div class="store-cats">
    <button class={catFilter === '' ? '' : 'secondary'} on:click={() => catFilter = ''}>Todo</button>
    {#each categories as c}
      <button class={catFilter === c ? '' : 'secondary'} on:click={() => catFilter = c}>{c}</button>
    {/each}
  </div>

  {#if filtered.length === 0}
    <div class="card"><p class="muted">No encontramos productos con esa búsqueda.</p></div>
  {/if}

  <div class="store-grid">
    <div class="store-products">
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">
        {#each filtered as p}
          <div class="card store-card">
            {#if p.image_url}
              <img src={p.image_url} alt={p.name} class="store-img" loading="lazy" />
            {:else}
              <div class="store-img store-img-fallback">{String(p.name || '?').slice(0, 1).toUpperCase()}</div>
            {/if}
            <div class="store-card-body">
              {#if p.categories?.name}<div class="muted store-cat-label">{p.categories.name}</div>{/if}
              <strong>{p.name}</strong>
              {#if p.description}<p class="muted store-desc">{p.description}</p>{/if}
              <div class="flex" style="justify-content:space-between;align-items:center;margin-top:auto;padding-top:8px">
                <span class="price">{fmtMoney(p.price)}</span>
                {#if qtyOf(p.id) > 0}
                  <span class="flex">
                    <button class="qty-btn" on:click={() => setQty(p.id, qtyOf(p.id) - 1)} aria-label="Quitar uno">−</button>
                    <strong style="min-width:22px;text-align:center">{qtyOf(p.id)}</strong>
                    <button class="qty-btn" on:click={() => setQty(p.id, qtyOf(p.id) + 1)} aria-label="Agregar uno">+</button>
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

    <aside class="card store-cart">
      <div class="flex" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">Tu pedido</h3>
        {#if $cartCount > 0}<span class="badge">{$cartCount} producto{$cartCount === 1 ? '' : 's'}</span>{/if}
      </div>
      {#if $cart.length === 0}
        <p class="muted">El carrito está vacío. Agrega productos del menú.</p>
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
        <div class="store-cart-actions">
          <button style="width:100%" on:click={() => navigate('/tienda/checkout')}>Ir a pagar</button>
          <WhatsAppButton phone={storePhone} message={waMessage} label="Enviar pedido por WhatsApp" />
        </div>
      {/if}
    </aside>
  </div>
{/if}
