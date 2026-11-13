<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney } from '../lib/api';

  let profit = null;
  let error = '';

  onMount(async () => {
    try { profit = await api('/reports/profitability'); }
    catch (e) { error = e.message; }
  });
</script>

<h2 class="page-title">Reportes financieros</h2>
{#if error}<div class="error-msg card">{error}</div>{/if}
{#if !profit}<p class="muted">Cargando…</p>
{:else}
  <div class="grid cols-4">
    <div class="card"><div class="kpi-label">Ingresos del mes</div><div class="kpi">{fmtMoney(profit.revenue)}</div></div>
    <div class="card"><div class="kpi-label">Gastos del mes</div><div class="kpi">{fmtMoney(profit.expenses)}</div></div>
    <div class="card"><div class="kpi-label">Utilidad</div><div class="kpi" style="color:{profit.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">{fmtMoney(profit.profit)}</div></div>
    <div class="card"><div class="kpi-label">Margen</div><div class="kpi">{profit.margin}%</div></div>
  </div>
  <div class="card">
    <h3>Valor del inventario</h3>
    <p style="font-size:24px;font-weight:700;color:var(--accent2)">{fmtMoney(profit.inventoryValue)}</p>
    <p class="muted">Costo total de los ingredientes en existencia (stock × costo unitario).</p>
  </div>
  <p class="muted">Para reportes detallados por fecha usa el filtro en la sección Ventas, y las métricas operativas en Dashboard.</p>
{/if}
