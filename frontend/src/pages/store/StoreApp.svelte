<script>
  import { route, navigate } from '../../lib/store';
  import { cartCount } from '../../lib/cart';
  import Catalog from './Catalog.svelte';
  import Checkout from './Checkout.svelte';
  import OrderStatus from './OrderStatus.svelte';
  import OrderLookup from './OrderLookup.svelte';

  $: path = ($route.split('?')[0] || '/');
  $: qs = $route.includes('?') ? $route.split('?')[1] : '';

  $: isCheckout = path === '/tienda/checkout';
  $: orderMatch = path.match(/^\/pedido\/([0-9a-f-]{36})$/i);
  $: isOrder = !!orderMatch;
  $: isLookup = path === '/pedido';

  function goStore() { navigate('/tienda'); }
</script>

<div class="store-shell">
  <header class="store-header">
    <button class="store-brand" on:click={goStore}>
      <strong>Daenerys</strong>
      <span>Hamburguesas · Burritos · Carne asada</span>
    </button>
    <nav class="store-nav">
      <button class="secondary" on:click={goStore}>Menú</button>
      <button class="secondary" on:click={() => navigate('/tienda/checkout')}>
        Carrito {#if $cartCount > 0}<span class="badge ok" style="margin-left:4px">{$cartCount}</span>{/if}
      </button>
      <button class="secondary" on:click={() => navigate('/pedido')}>Rastrear pedido</button>
    </nav>
  </header>

  <main class="store-main">
    {#if isCheckout}
      <Checkout {qs} />
    {:else if isOrder}
      <OrderStatus id={orderMatch[1]} {qs} />
    {:else if isLookup}
      <OrderLookup />
    {:else}
      <Catalog />
    {/if}
  </main>

  <footer class="store-footer muted">
    Daenerys — pedidos en línea
  </footer>
</div>
