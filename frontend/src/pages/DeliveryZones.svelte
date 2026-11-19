<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { api, fmtMoney } from '../lib/api';

  let zones = [];
  let loading = true;
  let error = '';
  let notice = '';

  let map;
  let layers = L.layerGroup();
  let mode = 'none';           // 'none' | 'polygon'
  let draftPoints = [];
  let draftMarkers = [];
  let draftLayer = null;

  let showForm = false;
  let formName = '';
  let formFee = '';
  let saving = false;

  const toLL = p => [p[0], p[1]];

  function shapeOf(z) {
    const pts = z.geometry?.points || [];
    if (pts.length < 3) return null;
    return L.polygon(pts.map(toLL), { color: '#0ea5e9', weight: 2, fillOpacity: 0.15 });
  }

  function renderShapes() {
    if (!map) return;
    layers.clearLayers();
    for (const z of zones) {
      const s = shapeOf(z);
      if (!s) continue;
      s.bindTooltip(`${z.name} · ${fmtMoney(z.delivery_fee)}`, { sticky: true });
      layers.addLayer(s);
    }
    if (!map.hasLayer(layers)) map.addLayer(layers);
  }

  async function load() {
    loading = true; error = '';
    try {
      zones = await api('/delivery-zones');
      renderShapes();
    } catch (e) { error = e.message; }
    loading = false;
  }

  function clearDraft() {
    if (draftLayer) { map.removeLayer(draftLayer); draftLayer = null; }
    for (const m of draftMarkers) map.removeLayer(m);
    draftMarkers = [];
    draftPoints = [];
  }

  function setMode(m) {
    mode = m;
    clearDraft();
    notice = m === 'polygon'
      ? 'Clic en el mapa para agregar vértices. Termina con al menos 3 puntos.'
      : '';
  }

  function onMapClick(e) {
    if (mode !== 'polygon') return;
    draftPoints.push([e.latlng.lat, e.latlng.lng]);
    draftMarkers.push(L.marker(e.latlng).addTo(map));
    if (draftLayer) map.removeLayer(draftLayer);
    draftLayer = L.polyline(draftPoints.map(toLL), { color: '#0ea5e9', dashArray: '6 6' }).addTo(map);
  }

  function finishDraft() {
    if (draftPoints.length < 3) {
      notice = 'Se necesitan al menos 3 vértices para el polígono.';
      return;
    }
    formName = '';
    formFee = '';
    showForm = true;
  }

  async function save() {
    if (!formName.trim()) { error = 'El nombre de la zona es obligatorio'; return; }
    const fee = Number(formFee);
    if (!Number.isFinite(fee) || fee < 0) { error = 'La tarifa debe ser un número mayor o igual a 0'; return; }
    saving = true; error = '';
    try {
      await api('/delivery-zones', {
        method: 'POST',
        body: { name: formName.trim(), geometry: { points: draftPoints }, delivery_fee: fee }
      });
      showForm = false;
      setMode('none');
      await load();
    } catch (e) { error = e.message; }
    saving = false;
  }

  async function toggleActive(z) {
    try {
      await api(`/delivery-zones/${z.id}`, { method: 'PUT', body: { active: !z.active } });
      await load();
    } catch (e) { error = e.message; }
  }

  async function remove(z) {
    if (!confirm(`¿Eliminar la zona "${z.name}"?`)) return;
    try { await api(`/delivery-zones/${z.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { error = e.message; }
  }

  onMount(() => {
    map = L.map('zones-map').setView([19.4326, -99.1332], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.on('click', onMapClick);
    load();
    return () => { map?.off('click', onMapClick); map?.remove(); };
  });

  onDestroy(() => map?.remove());
</script>

<h3>Zonas de entrega</h3>
<p class="muted">Dibuja polígonos en el mapa y asigna una tarifa de envío por zona. Si el cliente confirma su ubicación y cae fuera de todas las zonas, el pedido se rechaza. Sin zonas configuradas se cobra la tarifa plana de "Datos de entrega".</p>
{#if notice}<div class="card muted">{notice}</div>{/if}
{#if error}<div class="error-msg card">{error}</div>{/if}

<div class="toolbar">
  {#if mode === 'polygon' && draftPoints.length >= 3}
    <button on:click={finishDraft}>Terminar zona ({draftPoints.length} pts)</button>
  {/if}
  {#if mode === 'none'}
    <button class="secondary" on:click={() => setMode('polygon')}>Dibujar zona de entrega</button>
  {:else}
    <button class="secondary" on:click={() => setMode('none')}>Cancelar dibujo</button>
  {/if}
</div>

{#if showForm}
  <div class="card">
    <h4>Nueva zona de entrega</h4>
    <label for="dz-name">Nombre *</label>
    <input id="dz-name" bind:value={formName} placeholder="Ej. Centro, Norte, Sur…" />
    <label for="dz-fee">Tarifa de envío (MXN)</label>
    <input id="dz-fee" type="number" min="0" step="0.01" bind:value={formFee} placeholder="0.00" />
    <div class="flex">
      <button on:click={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar zona'}</button>
      <button class="secondary" on:click={() => { showForm = false; setMode('none'); }}>Cancelar</button>
    </div>
  </div>
{/if}

<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
  <div id="zones-map" style="height:380px;width:100%"></div>
</div>

<div class="card" style="overflow-x:auto">
  {#if loading}<p class="muted">Cargando…</p>
  {:else if zones.length === 0}<p class="muted">Sin zonas configuradas. Se aplicará la tarifa plana de entrega.</p>
  {:else}
    <table>
      <thead><tr><th>Zona</th><th>Tarifa</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        {#each zones as z}
          <tr>
            <td><strong>{z.name}</strong></td>
            <td>{fmtMoney(z.delivery_fee)}</td>
            <td><span class="badge {z.active ? 'ok' : 'warn'}">{z.active ? 'Activa' : 'Inactiva'}</span></td>
            <td style="white-space:nowrap">
              <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={() => toggleActive(z)}>{z.active ? 'Desactivar' : 'Activar'}</button>
              <button class="danger" style="padding:4px 10px;font-size:12px;margin-left:6px" on:click={() => remove(z)}>✕</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
