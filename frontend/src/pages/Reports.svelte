<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../lib/api';

  let from = '';
  let to = '';
  let loading = false;
  let error = '';

  let summary = null;
  let products = [];
  let customers = [];
  let inventory = null;

  function qs() {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function load() {
    loading = true; error = '';
    try {
      [summary, products, customers, inventory] = await Promise.all([
        api('/reports/summary' + qs()),
        api('/reports/products' + qs()),
        api('/reports/customers' + qs()),
        api('/reports/inventory')
      ]);
    } catch (e) { error = e.message; }
    loading = false;
  }

  function csvEscape(v) {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function downloadCSV(filename, headers, rows) {
    const csv = [headers.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportProducts() {
    downloadCSV('productos.csv',
      ['Producto', 'Unidades', 'Ingresos', 'Costo', 'Utilidad'],
      products.map(p => [p.name, p.quantity, p.revenue.toFixed(2), p.cost.toFixed(2), p.profit.toFixed(2)]));
  }

  function exportCustomers() {
    downloadCSV('clientes.csv',
      ['Cliente', 'Teléfono', 'Compras POS', 'Pedidos web', 'Total'],
      customers.map(c => [c.name, c.phone, c.purchases, c.orders, c.total.toFixed(2)]));
  }

  function exportInventory() {
    downloadCSV('inventario.csv',
      ['Ingrediente', 'Unidad', 'Stock', 'Stock mín.', 'Costo unit.', 'Valor', 'Alerta'],
      (inventory?.items || []).map(i => [i.name, i.unit, i.stock, i.min_stock ?? '', i.cost_per_unit, i.stock_value.toFixed(2), i.low ? 'Sí' : 'No']));
  }

  onMount(load);
</script>

<h2 class="page-title">Reportes</h2>

<div class="toolbar">
  <label style="margin:0">Desde <input type="date" bind:value={from} style="width:auto;display:inline-block" /></label>
  <label style="margin:0">Hasta <input type="date" bind:value={to} style="width:auto;display:inline-block" /></label>
  <button on:click={load} disabled={loading}>{loading ? 'Cargando…' : 'Aplicar'}</button>
</div>
{#if error}<div class="error-msg card">{error}</div>{/if}

{#if summary}
  <div class="grid cols-4">
    <div class="card"><div class="kpi-label">Ventas del periodo</div><div class="kpi">{fmtMoney(summary.revenue)}</div><div class="muted">{summary.sales_count} ventas</div></div>
    <div class="card"><div class="kpi-label">Gastos del periodo</div><div class="kpi">{fmtMoney(summary.expenses)}</div><div class="muted">{summary.expenses_count} registros</div></div>
    <div class="card"><div class="kpi-label">Utilidad</div><div class="kpi" style="color:{summary.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">{fmtMoney(summary.profit)}</div></div>
    <div class="card"><div class="kpi-label">Valor del inventario</div><div class="kpi">{fmtMoney(inventory?.total_value)}</div></div>
  </div>
{/if}

<div class="grid cols-2">
  <div class="card" style="overflow-x:auto">
    <div class="flex" style="justify-content:space-between;align-items:center">
      <h3 style="margin:0">Productos más vendidos</h3>
      <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={exportProducts}>Exportar CSV</button>
    </div>
    <table>
      <thead><tr><th>Producto</th><th>Unidades</th><th>Ingresos</th><th>Utilidad</th></tr></thead>
      <tbody>
        {#each products as p}
          <tr>
            <td>{p.name}</td><td>{p.quantity}</td>
            <td>{fmtMoney(p.revenue)}</td>
            <td style="color:{p.profit >= 0 ? 'var(--ok)' : 'var(--danger)'}">{fmtMoney(p.profit)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="card" style="overflow-x:auto">
    <div class="flex" style="justify-content:space-between;align-items:center">
      <h3 style="margin:0">Clientes</h3>
      <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={exportCustomers}>Exportar CSV</button>
    </div>
    <table>
      <thead><tr><th>Cliente</th><th>Compras</th><th>Pedidos web</th><th>Total</th></tr></thead>
      <tbody>
        {#each customers as c}
          <tr>
            <td>{c.name}{#if c.phone}<br /><span class="muted" style="font-size:12px">{c.phone}</span>{/if}</td>
            <td>{c.purchases}</td><td>{c.orders}</td><td>{fmtMoney(c.total)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<div class="card" style="overflow-x:auto">
  <div class="flex" style="justify-content:space-between;align-items:center">
    <h3 style="margin:0">Inventario</h3>
    <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={exportInventory}>Exportar CSV</button>
  </div>
  <p class="muted">Valor total en existencia: <strong>{fmtMoney(inventory?.total_value)}</strong>
    {#if inventory?.low_stock?.length} · <span style="color:var(--danger)">{inventory.low_stock.length} ingrediente(s) bajo mínimo</span>{/if}
  </p>
  <table>
    <thead><tr><th>Ingrediente</th><th>Stock</th><th>Mínimo</th><th>Costo unit.</th><th>Valor</th><th>Alerta</th></tr></thead>
    <tbody>
      {#each inventory?.items || [] as i}
        <tr>
          <td>{i.name}</td>
          <td>{i.stock} {i.unit}</td>
          <td>{i.min_stock ?? '—'}</td>
          <td>{fmtMoney(i.cost_per_unit)}</td>
          <td>{fmtMoney(i.stock_value)}</td>
          <td>{#if i.low}<span class="badge warn">Bajo</span>{:else}<span class="badge ok">OK</span>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
