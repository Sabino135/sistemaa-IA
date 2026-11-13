<script>
  import { onMount } from 'svelte';
  import { api, fmtMoney, fmtDate } from '../lib/api';

  export let endpoint;          // ej: '/products'
  export let title;
  export let columns = [];      // [{key, label}]
  export let fields = [];       // [{name,label,type,options,optionsFrom,required}]
  export let afterSave = null;  // callback opcional

  let rows = [];
  let loading = true;
  let error = '';
  let editing = null;           // objeto en edición o {} para nuevo
  let showForm = false;
  let search = '';
  let form = {};
  let saving = false;
  let optionCache = {};
  let fieldsR = fields;

  async function loadOptions(f) {
    if (!f.optionsFrom) return f.options || [];
    const key = f.optionsFrom.endpoint;
    if (!optionCache[key]) {
      try { optionCache[key] = await api(key); } catch { optionCache[key] = []; }
    }
    return optionCache[key].map(o => ({
      value: o[f.optionsFrom.valueKey || 'id'],
      label: o[f.optionsFrom.labelKey || 'name']
    }));
  }

  async function load() {
    loading = true; error = '';
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      rows = await api(endpoint + qs);
    } catch (e) { error = e.message; }
    loading = false;
  }

  function getVal(row, key) {
    return key.split('.').reduce((o, k) => o?.[k], row);
  }

  function startNew() {
    editing = {};
    form = {};
    for (const f of fields) form[f.name] = f.type === 'checkbox' ? true : (f.default ?? '');
    showForm = true;
  }

  function startEdit(row) {
    editing = row;
    form = {};
    for (const f of fields) {
      let v = getVal(row, f.name);
      if (f.type === 'checkbox') v = !!v;
      if (v === null || v === undefined) v = f.type === 'checkbox' ? true : '';
      form[f.name] = v;
    }
    showForm = true;
  }

  async function save() {
    saving = true; error = '';
    try {
      const body = {};
      for (const f of fields) {
        let v = form[f.name];
        if (f.type === 'number') v = v === '' ? null : Number(v);
        if (f.type === 'checkbox') v = !!v;
        body[f.name] = v;
      }
      if (editing?.id) await api(`${endpoint}/${editing.id}`, { method: 'PUT', body });
      else await api(endpoint, { method: 'POST', body });
      showForm = false;
      await load();
      if (afterSave) afterSave();
    } catch (e) { error = e.message; }
    saving = false;
  }

  async function remove(row) {
    if (!confirm(`¿Eliminar "${row.name || row.description || row.id}"?`)) return;
    try { await api(`${endpoint}/${row.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { error = e.message; }
  }

  onMount(async () => {
    fieldsR = await Promise.all(fields.map(async f => {
      if (f.optionsFrom) return { ...f, _options: await loadOptions(f) };
      if (f.options) return { ...f, _options: f.options };
      return f;
    }));
    load();
  });
</script>

<div class="toolbar">
  <h2 class="page-title" style="margin:0;flex:1">{title}</h2>
  <input placeholder="Buscar…" bind:value={search} on:keydown={(e) => e.key === 'Enter' && load()} style="width:220px" />
  <button class="secondary" on:click={load}>Buscar</button>
  <button on:click={startNew}>+ Nuevo</button>
</div>

{#if error}<div class="error-msg card">{error}</div>{/if}

{#if showForm}
  <div class="card">
    <h3>{editing?.id ? 'Editar' : 'Nuevo'} registro</h3>
    <div class="grid cols-2">
      {#each fieldsR as f}
        <div>
          <label for="f-{f.name}">{f.label}{f.required ? ' *' : ''}</label>
          {#if f.type === 'select'}
            <select id="f-{f.name}" bind:value={form[f.name]}>
              <option value="">— Seleccionar —</option>
              {#each f._options || [] as o}
                <option value={o.value}>{o.label}</option>
              {/each}
            </select>
          {:else if f.type === 'textarea'}
            <textarea id="f-{f.name}" bind:value={form[f.name]} rows="2"></textarea>
          {:else if f.type === 'checkbox'}
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
              <input type="checkbox" bind:checked={form[f.name]} style="width:auto;margin:0" /> {f.label}
            </label>
          {:else}
            <input id="f-{f.name}" type={f.type || 'text'} value={form[f.name]}
              on:input={(e) => form[f.name] = e.target.value} required={f.required} />
          {/if}
        </div>
      {/each}
    </div>
    <div class="flex">
      <button on:click={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      <button class="secondary" on:click={() => showForm = false}>Cancelar</button>
    </div>
  </div>
{/if}

<div class="card" style="overflow-x:auto">
  {#if loading}<p class="muted">Cargando…</p>
  {:else if rows.length === 0}<p class="muted">Sin registros.</p>
  {:else}
    <table>
      <thead><tr>{#each columns as c}<th>{c.label}</th>{/each}<th></th></tr></thead>
      <tbody>
        {#each rows as row}
          <tr>
            {#each columns as c}
              <td>
                {#if c.money}{getVal(row, c.key) == null ? 'Pendiente' : fmtMoney(getVal(row, c.key))}
                {:else if c.date}{fmtDate(getVal(row, c.key))}
                {:else if c.badge}
                  <span class="badge {getVal(row, c.key) ? 'ok' : 'warn'}">{getVal(row, c.key) ? 'Activo' : 'Inactivo'}</span>
                {:else}{getVal(row, c.key) ?? '—'}{/if}
              </td>
            {/each}
            <td style="white-space:nowrap">
              <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={() => startEdit(row)}>Editar</button>
              <button class="danger" style="padding:4px 10px;font-size:12px;margin-left:6px" on:click={() => remove(row)}>✕</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
