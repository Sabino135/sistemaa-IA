<script>
  import { onMount } from 'svelte';
  import { route, navigate, user } from '../../lib/store';
  import { cartCount } from '../../lib/cart';
  import { storeSettings, loadStoreSettings } from '../../lib/storefront';
  import WhatsAppButton from '../../lib/WhatsAppButton.svelte';
  import Catalog from './Catalog.svelte';
  import Checkout from './Checkout.svelte';
  import OrderStatus from './OrderStatus.svelte';
  import OrderLookup from './OrderLookup.svelte';
  import StoreAccount from './StoreAccount.svelte';

  $: path = ($route.split('?')[0] || '/');
  $: qs = $route.includes('?') ? $route.split('?')[1] : '';

  $: isCheckout = path === '/tienda/checkout';
  $: isAccount = path === '/tienda/cuenta';
  $: orderMatch = path.match(/^\/pedido\/([0-9a-f-]{36})$/i);
  $: isOrder = !!orderMatch;
  $: isLookup = path === '/pedido';
  $: isStaff = !!$user && $user.role !== 'cliente';

  onMount(() => {
    loadStoreSettings()
      .then((st) => {
        // Aplicar color de tema configurado por el admin
        if (st?.theme_color) {
          document.documentElement.style.setProperty('--accent', st.theme_color);
          document.documentElement.style.setProperty('--accent2', st.theme_color);
        }
      })
      .catch(() => {});
  });

  function goStore() { navigate('/tienda'); }
  function goPanel() { navigate('/dashboard'); }
</script>

<div class="store-shell">
  <header class="store-header">
    <button class="store-brand" on:click={goStore}>
      {#if $storeSettings?.logo_url}
        <img class="store-logo" src={$storeSettings.logo_url} alt={$storeSettings.store_name || 'Tienda'} />
      {/if}
      <span class="store-brand-copy">
        <strong>{$storeSettings?.store_name || 'Daenerys'}</strong>
        <span>{$storeSettings?.store_tagline || 'Hamburguesas · Burritos · Carne asada'}</span>
      </span>
    </button>
    <nav class="store-nav">
      <button class="secondary" on:click={goStore}>Menú</button>
      <button class="secondary" on:click={() => navigate('/tienda/checkout')}>
        Carrito {#if $cartCount > 0}<span class="badge ok" style="margin-left:4px">{$cartCount}</span>{/if}
      </button>
      <button class="secondary" on:click={() => navigate('/pedido')}>Rastrear pedido</button>
      <button class="secondary" on:click={() => navigate('/tienda/cuenta')}>Mi cuenta</button>
      {#if isStaff}<button class="secondary" on:click={goPanel}>Panel</button>
      {:else if !$user}<button class="secondary" on:click={() => navigate('/login')}>Acceso personal</button>{/if}
    </nav>
  </header>

  {#if $storeSettings?.announcement}
    <div class="store-announce">{$storeSettings.announcement}</div>
  {/if}
  {#if $storeSettings && $storeSettings.store_open === false}
    <div class="store-announce" style="background:rgba(239,68,68,.15);border-bottom-color:rgba(239,68,68,.4)">
      Tienda cerrada temporalmente. Vuelve pronto.
    </div>
  {/if}

  <main class="store-main">
    {#if isCheckout}
      <Checkout {qs} />
    {:else if isAccount}
      <StoreAccount />
    {:else if isOrder}
      <OrderStatus id={orderMatch[1]} {qs} />
    {:else if isLookup}
      <OrderLookup />
    {:else}
      <Catalog />
    {/if}
  </main>

  <footer class="store-footer">
    <div class="store-footer-grid">
      <div>
        <strong>{$storeSettings?.store_name || 'Daenerys'}</strong>
        {#if $storeSettings?.store_tagline}<p class="muted">{$storeSettings.store_tagline}</p>{/if}
      </div>
      <div class="muted">
        {#if $storeSettings?.address}<p>{$storeSettings.address}</p>{/if}
        {#if $storeSettings?.phone}<p>Tel: {$storeSettings.phone}</p>{/if}
        {#if $storeSettings?.business_hours}<p>Horario: {$storeSettings.business_hours}</p>{/if}
        {#if $storeSettings?.email}<p>{$storeSettings.email}</p>{/if}
        {#if $storeSettings?.social?.facebook || $storeSettings?.social?.instagram || $storeSettings?.social?.tiktok}
          <p class="store-social">
            {#if $storeSettings.social.facebook}<a href={$storeSettings.social.facebook} target="_blank" rel="noopener">Facebook</a>{/if}
            {#if $storeSettings.social.instagram}<a href={$storeSettings.social.instagram} target="_blank" rel="noopener">Instagram</a>{/if}
            {#if $storeSettings.social.tiktok}<a href={$storeSettings.social.tiktok} target="_blank" rel="noopener">TikTok</a>{/if}
          </p>
        {/if}
      </div>
      <div>
        <WhatsAppButton phone={$storeSettings?.whatsapp || $storeSettings?.phone} label="Escríbenos por WhatsApp" />
        {#if isStaff}<p class="muted" style="margin-top:8px"><a href="#/dashboard" on:click|preventDefault={goPanel}>Ir al panel de administración</a></p>{/if}
      </div>
    </div>
    <p class="muted" style="margin-top:14px">Pedidos en línea · Pago al recibir o por transferencia</p>
  </footer>

  <WhatsAppButton floating phone={$storeSettings?.whatsapp || $storeSettings?.phone} label="Chatear por WhatsApp" />
</div>
