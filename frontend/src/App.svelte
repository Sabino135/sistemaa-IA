<script>
  import './app.css';
  import { onMount } from 'svelte';
  import { route, user, sessionReady, passwordRecovery, logout, initAuth, onAuthChange, navigate } from './lib/store';
  import { api } from './lib/api';
  import Login from './pages/Login.svelte';
  import ResetPassword from './pages/ResetPassword.svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import POS from './pages/POS.svelte';
  import Sales from './pages/Sales.svelte';
  import Orders from './pages/Orders.svelte';
  import StoreApp from './pages/store/StoreApp.svelte';
  import Products from './pages/Products.svelte';
  import Categories from './pages/Categories.svelte';
  import Inventory from './pages/Inventory.svelte';
  import Customers from './pages/Customers.svelte';
  import Expenses from './pages/Expenses.svelte';
  import Reports from './pages/Reports.svelte';
  import Users from './pages/Users.svelte';
  import Settings from './pages/Settings.svelte';
  import Geofences from './pages/Geofences.svelte';
  import Footer from './lib/Footer.svelte';
  import Logo from './lib/Logo.svelte';

  const pages = {
    '/login': Login,
    '/dashboard': Dashboard,
    '/pos': POS,
    '/sales': Sales,
    '/orders': Orders,
    '/products': Products,
    '/categories': Categories,
    '/inventory': Inventory,
    '/customers': Customers,
    '/expenses': Expenses,
    '/reports': Reports,
    '/users': Users,
    '/settings': Settings,
    '/geofences': Geofences
  };

  // roles: null = todos los usuarios; array = solo esos roles
  const NAV = [
    { path: '/dashboard', label: 'Dashboard', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', roles: null },
    { path: '/tienda', label: 'Tienda online', icon: 'M3 9l1.5-5h15L21 9M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 21V12h6v9', roles: null },
    { path: '/pos', label: 'Punto de venta', icon: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM9 7h6M9 11h6M9 15h4', roles: null },
    { path: '/sales', label: 'Ventas', icon: 'M4 2h16v20l-3-2-3 2-3-2-3 2-3-2-1 1zM8 7h8M8 11h8', roles: null },
    { path: '/orders', label: 'Pedidos web', icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0', roles: ['admin', 'cajero'] },
    { path: '/products', label: 'Productos', icon: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8', roles: null },
    { path: '/categories', label: 'Categorías', icon: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01', roles: null },
    { path: '/inventory', label: 'Inventario y recetas', icon: 'M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 21V12h6v9', roles: ['admin', 'inventario'] },
    { path: '/customers', label: 'Clientes', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', roles: ['admin', 'cajero'] },
    { path: '/expenses', label: 'Gastos', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', roles: ['admin'] },
    { path: '/reports', label: 'Reportes', icon: 'M3 3v18h18M7 14l4-4 4 3 5-6', roles: ['admin', 'inventario'] },
    { path: '/users', label: 'Usuarios y permisos', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', roles: ['admin'] },
    { path: '/geofences', label: 'Geocercas', icon: 'M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', roles: null },
    { path: '/settings', label: 'Configuración', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z', roles: ['admin'] }
  ];

  const ROLE_LABELS = { admin: 'Administrador', cajero: 'Cajero', inventario: 'Inventario' };

  $: current = $route.split('?')[0] || '/';
  $: isCustomer = $user?.role === 'cliente';
  // La tienda online y el rastreo de pedidos son públicos (no requieren login).
  // '/' muestra la tienda a visitantes; el personal entra al panel por /login.
  $: isPublicStore = current.startsWith('/tienda') || current.startsWith('/pedido') || isCustomer || (current === '/' && !$user);
  $: Page = pages[current] || Dashboard;
  $: isLogin = current === '/login';
  $: loggedIn = !!$user;
  $: role = $user?.role || 'cajero';
  $: visibleNav = NAV.filter(n => !n.roles || n.roles.includes(role));

  let alertCount = 0;
  let todayStr = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  onMount(async () => {
    const unsub = onAuthChange((event) => {
      if (event === 'SIGNED_IN' && isLogin) navigate('/dashboard');
      if (event === 'SIGNED_OUT' && !isLogin) navigate('/login');
    });
    await initAuth();
    if ($user?.role === 'cliente' && !current.startsWith('/tienda') && !current.startsWith('/pedido')) navigate('/tienda');
    if ($user && $user.role !== 'cliente' && (isLogin || current === '/')) navigate('/dashboard');
    if (!$user && !isLogin && current !== '/' && !isPublicStore) navigate('/login');
    if ($user && $user.role !== 'cliente' && !isPublicStore) loadAlerts();
    return unsub;
  });

  async function loadAlerts() {
    try { alertCount = (await api('/inventory/alerts')).length; } catch { alertCount = 0; }
  }

  function bell() { navigate('/inventory'); }
  function doLogout() { logout(); }
</script>

{#if !$sessionReady}
  <div class="login-wrap muted">Cargando…</div>
{:else if $passwordRecovery}
  <ResetPassword />
{:else if isPublicStore}
  <StoreApp />
{:else if isLogin || !loggedIn}
  <Login />
{:else}
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <Logo src="/images/logo.png" alt="DAENERYS" width="42" />
        <div>
          <div class="brand-name">DAENERYS</div>
          <div class="brand-sub">Hamburguesas · Burritos · Carne asada</div>
        </div>
      </div>
      <nav>
        {#each visibleNav as item}
          <a href="#{item.path}" class:active={current === item.path}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={item.icon}/></svg>
            <span>{item.label}</span>
          </a>
        {/each}
      </nav>
      <div class="spacer"></div>
      <div class="sidebar-user">
        <div class="sidebar-user-name">{$user?.name || $user?.email}</div>
        <span class="badge">{ROLE_LABELS[role] || role}</span>
      </div>
    </aside>

    <div class="main-wrap">
      <header class="topbar">
        <div class="topbar-left">
          <Logo src="/images/logo.png" alt="DAENERYS" width="120" />
          <div class="topbar-copy">
            <div class="topbar-title">Panel de administración</div>
            <div class="topbar-date muted">{todayStr}</div>
          </div>
        </div>
        <div class="topbar-right">
          <button class="icon-btn" on:click={bell} aria-label="Notificaciones" title="Alertas de inventario">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
            {#if alertCount > 0}<span class="notif-dot">{alertCount}</span>{/if}
          </button>
          <div class="user-chip">
            <span class="user-avatar">{($user?.name || $user?.email || '?').charAt(0).toUpperCase()}</span>
            <span class="user-chip-name">{$user?.name || $user?.email}</span>
          </div>
          <button class="secondary logout-btn" on:click={doLogout}>Cerrar sesión</button>
        </div>
      </header>
      <main class="main">
        <svelte:component this={Page} />
      </main>
      <Footer />
    </div>
  </div>
{/if}
