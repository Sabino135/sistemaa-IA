<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../lib/api';
  import CrudPage from '../lib/CrudPage.svelte';

  let tab = 'stock';
  let stock = [];
  let movements = [];
  let recipes = [];
  let products = [];
  let ingredients = [];
  let alerts = [];
  let error = '';

  // Ajuste manual
  let adjIng = '';
  let adjQty = '';
  let adjType = 'in';
  let adjReason = '';

  // Nueva receta
  let recProduct = '';
  let recIng = '';
  let recQty = '';

  const ingFields = [
    { name: 'name', label: 'Nombre', required: true },
    { name: 'unit', label: 'Unidad (pz, kg, lt…)', default: 'pz' },
    { name: 'stock', label: 'Stock inicial', type: 'number', default: 0 },
    { name: 'min_stock', label: 'Stock mínimo (alerta)', type: 'number' },
    { name: 'cost_per_unit', label: 'Costo por unidad', type: 'number', default: 0 },
    { name: 'active', label: 'Activo', type: 'checkbox' }
  ];
  const ingCols = [
    { key: 'name', label: 'Ingrediente' },
    { key: 'unit', label: 'Unidad' },
    { key: 'stock', label: 'Stock' },
    { key: 'min_stock', label: 'Mínimo' },
    { key: 'cost_per_unit', label: 'Costo/unit', money: true },
    { key: 'active', label: 'Estado', badge: true }
  ];

  async function load() {
    error = '';
    try {
      [stock, movements, recipes, products, ingredients, alerts] = await Promise.all([
        api('/inventory/stock'),
        api('/inventory/movements'),
        api('/inventory/recipes'),
        api('/products'),
        api('/ingredients'),
        api('/inventory/alerts')
      ]);
    } catch (e) { error = e.message; }
  }

  async function adjust() {
    try {
      await api('/inventory/adjust', {
        method: 'POST',
        body: { ingredient_id: adjIng, quantity: Number(adjQty), type: adjType, reason: adjReason || 'Ajuste manual' }
      });
      adjQty = ''; adjReason = '';
      load();
    } catch (e) { error = e.message; }
  }

  async function addRecipe() {
    try {
      await api('/inventory/recipes', {
        method: 'POST',
        body: { product_id: recProduct, ingredient_id: recIng, quantity: Number(recQty) }
      });
      recProduct = ''; recIng = ''; recQty = '';
      load();
    } catch (e) { error = e.message; }
  }

  async function delRecipe(id) {
    await api(`/inventory/recipes/${id}`, { method: 'DELETE' });
    load();
  }

  onMount(load);
</script>

<h2 class="page-title">Inventario</h2>
{#if error}<div class="error-msg card">{error}</div>{/if}

{#if alerts.length > 0}
  <div class="card" style="border-color:#facc15">
    <strong>⚠ Stock bajo:</strong>
    {#each alerts as a, idx}{a.name} ({a.stock} {a.unit}){idx < alerts.length - 1 ? ', ' : ''}{/each}
  </div>
{/if}

<div class="tabs">
  <button class:active={tab === 'stock'} class="secondary" on:click={() => tab = 'stock'}>Existencias</button>
  <button class:active={tab === 'recipes'} class="secondary" on:click={() => tab = 'recipes'}>Recetas</button>
  <button class:active={tab === 'movements'} class="secondary" on:click={() => tab = 'movements'}>Movimientos</button>
  <button class:active={tab === 'adjust'} class="secondary" on:click={() => tab = 'adjust'}>Ajuste manual</button>
</div>

{#if tab === 'stock'}
  <div class="card" style="overflow-x:auto">
    <table>
      <thead><tr><th>Ingrediente</th><th>Unidad</th><th>Stock</th><th>Mínimo</th><th>Costo/unit</th><th>Valor</th></tr></thead>
      <tbody>
        {#each stock as i}
          <tr>
            <td>{i.name}</td><td>{i.unit}</td>
            <td><span class="badge {i.min_stock != null && i.stock <= i.min_stock ? 'warn' : 'ok'}">{i.stock}</span></td>
            <td>{i.min_stock ?? '—'}</td>
            <td>{fmtMoney(i.cost_per_unit)}</td>
            <td>{fmtMoney(i.stock * i.cost_per_unit)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <CrudPage endpoint="/ingredients" title="Ingredientes" columns={ingCols} fields={ingFields} afterSave={load} />

{:else if tab === 'recipes'}
  <div class="grid cols-2">
    <div class="card">
      <h3>Nueva receta</h3>
      <label>Producto</label>
      <select bind:value={recProduct}>
        <option value="">— Seleccionar —</option>
        {#each products.filter(p => p.active) as p}<option value={p.id}>{p.name}</option>{/each}
      </select>
      <label>Ingrediente</label>
      <select bind:value={recIng}>
        <option value="">— Seleccionar —</option>
        {#each ingredients.filter(i => i.active) as i}<option value={i.id}>{i.name} ({i.unit})</option>{/each}
      </select>
      <label>Cantidad por unidad</label>
      <input type="number" step="0.001" min="0" bind:value={recQty} />
      <button on:click={addRecipe}>Agregar</button>
    </div>
    <div class="card" style="overflow-x:auto">
      <h3>Recetas registradas</h3>
      <table>
        <thead><tr><th>Producto</th><th>Ingrediente</th><th>Cantidad</th><th></th></tr></thead>
        <tbody>
          {#each recipes as r}
            <tr>
              <td>{r.products?.name}</td>
              <td>{r.ingredients?.name} ({r.ingredients?.unit})</td>
              <td>{r.quantity}</td>
              <td><button class="danger" style="padding:3px 8px;font-size:12px" on:click={() => delRecipe(r.id)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

{:else if tab === 'movements'}
  <div class="card" style="overflow-x:auto">
    <table>
      <thead><tr><th>Fecha</th><th>Ingrediente</th><th>Cantidad</th><th>Tipo</th><th>Motivo</th></tr></thead>
      <tbody>
        {#each movements as m}
          <tr>
            <td>{fmtDate(m.created_at)}</td>
            <td>{m.ingredients?.name}</td>
            <td style="color:{m.quantity >= 0 ? 'var(--ok)' : 'var(--danger)'}">{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
            <td><span class="badge">{m.type}</span></td>
            <td>{m.reason || '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

{:else}
  <div class="card">
    <h3>Ajuste manual de inventario</h3>
    <div class="grid cols-2">
      <div>
        <label>Ingrediente</label>
        <select bind:value={adjIng}>
          <option value="">— Seleccionar —</option>
          {#each stock as i}<option value={i.id}>{i.name} (stock: {i.stock} {i.unit})</option>{/each}
        </select>
        <label>Cantidad</label>
        <input type="number" step="0.001" bind:value={adjQty} />
        <label>Tipo</label>
        <select bind:value={adjType}>
          <option value="in">Entrada (compra/ingreso)</option>
          <option value="out">Salida (merma/consumo)</option>
        </select>
      </div>
      <div>
        <label>Motivo</label>
        <input bind:value={adjReason} placeholder="Ej. Compra a proveedor" />
        <button style="margin-top:20px" on:click={adjust} disabled={!adjIng || !adjQty}>Aplicar ajuste</button>
      </div>
    </div>
  </div>
{/if}
