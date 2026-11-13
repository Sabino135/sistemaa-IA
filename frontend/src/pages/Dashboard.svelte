<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../lib/api';
  import { user, navigate } from '../lib/store';

  let dash = null;
  let products = [];
  let error = '';
  let loading = true;

  const IMGS = {
    steak: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=70',
    burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=70',
    combo: 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=800&q=70',
    burrito: 'https://images.unsplash.com/photo-1613514785940-daed07799d9b?auto=format&fit=crop&w=800&q=70'
  };

  function imgFor(p) {
    const n = (p.name || '').toLowerCase();
    if (n.includes('carne asada')) return IMGS.steak;
    if (n.includes('combo')) return IMGS.combo;
    if (n.includes('monster')) return IMGS.burger;
    if (n.includes('burrito')) return IMGS.burrito;
    return IMGS.burger;
  }

  function quickSell(p) {
    if (p.price == null) { navigate('/products'); return; }
    navigate(`/pos?add=${p.id}`);
  }

  $: chart = (dash?.salesByDay || []).map(d => ({ ...d, label: new Date(d.date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) }));
  $: chartMax = Math.max(1, ...chart.map(d => d.total));
  $: topMax = Math.max(1, ...(dash?.topProducts || []).map(p => p.quantity));

  async function load() {
    loading = true; error = '';
    try {
      [dash, products] = await Promise.all([api('/reports/dashboard'), api('/products')]);
    } catch (e) { error = e.message; }
    loading = false;
  }

  onMount(load);
</script>

<div class="dash-head">
  <div>
    <h2 class="page-title" style="margin:0">Hola, {$user?.name?.split(' ')[0] || 'bienvenido'}</h2>
    <p class="muted" style="margin:4px 0 0">Así va tu negocio hoy · {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
  </div>
  <div class="flex">
    <button class="secondary" on:click={load} disabled={loading}>Actualizar</button>
    <button on:click={() => navigate('/pos')}>Ir al punto de venta</button>
  </div>
</div>

{#if error}<div class="error-msg card">{error}</div>{/if}
{#if loading && !dash}<p class="muted">Cargando dashboard…</p>
{:else if dash}
  <!-- KPIs -->
  <div class="grid kpi-grid">
    <div class="card kpi-card accent">
      <div class="kpi-label">Ventas de hoy</div>
      <div class="kpi">{fmtMoney(dash.today.total)}</div>
      <div class="kpi-sub">{dash.today.orders} pedido{dash.today.orders === 1 ? '' : 's'}</div>
    </div>
    <div class="card kpi-card">
      <div class="kpi-label">Pedidos de hoy</div>
      <div class="kpi">{dash.today.orders}</div>
      <div class="kpi-sub">{dash.today.units} unidad{dash.today.units === 1 ? '' : 'es'} vendida{dash.today.units === 1 ? '' : 's'}</div>
    </div>
    <div class="card kpi-card">
      <div class="kpi-label">Ticket promedio</div>
      <div class="kpi">{fmtMoney(dash.today.avgTicket)}</div>
      <div class="kpi-sub">por pedido hoy</div>
    </div>
    <div class="card kpi-card">
      <div class="kpi-label">Ingresos del mes</div>
      <div class="kpi">{fmtMoney(dash.month.total)}</div>
      <div class="kpi-sub">acumulado</div>
    </div>
    <div class="card kpi-card">
      <div class="kpi-label">Gastos registrados</div>
      <div class="kpi">{fmtMoney(dash.month.expenses)}</div>
      <div class="kpi-sub">{fmtMoney(dash.today.expenses)} hoy</div>
    </div>
    <div class="card kpi-card">
      <div class="kpi-label">Utilidad estimada</div>
      <div class="kpi" style="color:{dash.month.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">{fmtMoney(dash.month.profit)}</div>
      <div class="kpi-sub">mes en curso</div>
    </div>
    <div class="card kpi-card warn" style="cursor:pointer" on:click={() => navigate('/inventory')} role="button">
      <div class="kpi-label">Alertas de inventario</div>
      <div class="kpi" style="color:{dash.lowStockCount ? '#facc15' : 'var(--ok)'}">{dash.lowStockCount}</div>
      <div class="kpi-sub">{dash.lowStockCount ? 'ingredientes con stock bajo' : 'inventario en orden'}</div>
    </div>
  </div>

  <!-- Productos -->
  <h3 class="section-title">Productos</h3>
  <div class="grid prod-grid">
    {#each products.filter(p => p.active) as p}
      <div class="card prod-card">
        <div class="prod-img" style="background-image:url('{imgFor(p)}')">
          {#if p.price == null}<span class="badge err prod-badge">Precio pendiente</span>{/if}
        </div>
        <div class="prod-body">
          <div class="prod-name">{p.name}</div>
          {#if p.description}<div class="muted prod-desc">{p.description}</div>{/if}
          <div class="prod-foot">
            <span class="prod-price">{p.price == null ? 'Sin precio' : fmtMoney(p.price)}</span>
            <button class="prod-sell" on:click={() => quickSell(p)}>
              {p.price == null ? 'Configurar' : 'Vender'}
            </button>
          </div>
        </div>
      </div>
    {:else}
      <div class="card"><p class="muted">No hay productos activos. <a href="#/products" on:click|preventDefault={() => navigate('/products')}>Administra el catálogo</a>.</p></div>
    {/each}
  </div>

  <!-- Operación -->
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head">
        <h3>Ventas de los últimos 14 días</h3>
        <span class="muted">{fmtMoney(chart.reduce((a, d) => a + d.total, 0))} en el periodo</span>
      </div>
      {#if chart.every(d => d.total === 0)}
        <p class="muted">Aún no hay ventas registradas en este periodo.</p>
      {:else}
        <div class="chart">
          {#each chart as d}
            <div class="chart-col" title="{d.date}: {fmtMoney(d.total)}">
              <div class="chart-bar" style="height:{Math.max(2, d.total / chartMax * 100)}%"></div>
              <div class="chart-label">{d.label}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="card">
      <div class="card-head"><h3>Pedidos recientes</h3><a href="#/sales" on:click|preventDefault={() => navigate('/sales')}>Ver todos</a></div>
      {#if dash.recentOrders.length === 0}
        <p class="muted">Sin pedidos todavía.</p>
      {:else}
        <table>
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Items</th><th>Total</th></tr></thead>
          <tbody>
            {#each dash.recentOrders as o}
              <tr>
                <td>{fmtDate(o.created_at)}</td>
                <td>{o.customer}</td>
                <td>{o.items}</td>
                <td><strong>{fmtMoney(o.total)}</strong></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>

  <div class="grid cols-2">
    <div class="card">
      <h3>Productos más vendidos (mes)</h3>
      {#if dash.topProducts.length === 0}<p class="muted">Aún no hay ventas este mes.</p>
      {:else}
        <div class="top-list">
          {#each dash.topProducts.slice(0, 5) as p, i}
            <div class="top-row">
              <span class="top-rank">{i + 1}</span>
              <div class="top-info">
                <div class="top-name">{p.name}</div>
                <div class="top-bar"><div style="width:{p.quantity / topMax * 100}%"></div></div>
              </div>
              <div class="top-qty">{p.quantity} pzs<br /><span class="muted">{fmtMoney(p.total)}</span></div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="card">
      <div class="card-head"><h3>Alertas de inventario</h3><a href="#/inventory" on:click|preventDefault={() => navigate('/inventory')}>Ir a inventario</a></div>
      {#if dash.lowStock.length === 0}<p class="muted">Todo el inventario está en niveles correctos.</p>
      {:else}
        <table>
          <thead><tr><th>Ingrediente</th><th>Stock</th><th>Mínimo</th></tr></thead>
          <tbody>
            {#each dash.lowStock as i}
              <tr><td>{i.name}</td><td><span class="badge warn">{i.stock} {i.unit}</span></td><td>{i.min_stock} {i.unit}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dash-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .kpi-grid { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  .kpi-card { margin-bottom: 0; }
  .kpi-card.accent { border-color: rgba(249, 115, 22, .5); }
  .kpi-sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .section-title { font-size: 16px; margin: 24px 0 12px; }
  .prod-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .prod-card { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
  .prod-img { height: 140px; background-size: cover; background-position: center; position: relative; }
  .prod-badge { position: absolute; top: 10px; right: 10px; }
  .prod-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .prod-name { font-weight: 700; font-size: 14px; }
  .prod-desc { font-size: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 30px; }
  .prod-foot { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 8px; }
  .prod-price { color: var(--accent2); font-weight: 700; }
  .prod-sell { padding: 6px 12px; font-size: 12px; border-radius: 8px; }
  .card-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .card-head h3 { margin: 0; }
  .chart { display: flex; align-items: flex-end; gap: 6px; height: 170px; padding-top: 10px; }
  .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 0; }
  .chart-bar { width: 100%; max-width: 34px; background: linear-gradient(180deg, var(--accent2), var(--accent)); border-radius: 6px 6px 0 0; min-height: 2px; }
  .chart-label { font-size: 10px; color: var(--muted); margin-top: 6px; white-space: nowrap; }
  .top-list { display: flex; flex-direction: column; gap: 12px; }
  .top-row { display: flex; align-items: center; gap: 12px; }
  .top-rank { width: 22px; height: 22px; border-radius: 50%; background: var(--panel2); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--accent2); flex-shrink: 0; }
  .top-info { flex: 1; min-width: 0; }
  .top-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .top-bar { height: 6px; background: var(--panel2); border-radius: 4px; margin-top: 4px; overflow: hidden; }
  .top-bar div { height: 100%; background: var(--accent); border-radius: 4px; }
  .top-qty { font-size: 12px; text-align: right; flex-shrink: 0; }
</style>
