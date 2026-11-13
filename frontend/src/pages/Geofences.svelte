<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { api, fmtDate } from '../lib/api';

  const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#eab308'];

  let rows = [];
  let loading = true;
  let error = '';
  let notice = '';

  let map;
  let layers = L.layerGroup();
  let draftLayer = null;      // capa temporal mientras se dibuja
  let draftMarkers = [];

  // edición de vértices de polígono existente
  let mode = 'none';          // 'none' | 'polygon' | 'circle' | 'editpoly'
  let draftPoints = [];       // [[lat,lng],...]
  let circleCenter = null;    // [lat,lng]
  let circleRadius = null;    // metros
  let editPoints = null;      // vértices al editar un polígono
  let editLayer = null;
  let editMarkers = [];
  let meMarker = null;

  // formulario de guardado
  let editingId = null;
  let formName = '';
  let formColor = COLORS[0];
  let formRadius = '';
  let showForm = false;
  let saving = false;

  // resultado del check de ubicación
  let checkResult = null;
  let checkingLoc = false;

  // seguimiento y eventos de entrada/salida
  let events = [];
  let eventsLoading = false;
  let eventGeofenceId = '';
  let eventType = '';
  let tracking = false;
  let watchId = null;
  let trackQueue = Promise.resolve();
  let lastTrackAt = 0;
  let lastTrackPoint = null;
  let lastEventNotice = '';
  let destroyed = false;

  const toLL = p => [p[0], p[1]]; // geometry guarda [lat,lng]

  function distanceM(a, b) {
    const R = 6371000;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLng = toRad(b[1] - a[1]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function shapeOf(g) {
    if (g.kind === 'circle') {
      const c = g.geometry?.center || g.geometry?.points?.[0];
      const r = Number(g.geometry?.radius_m || 0);
      if (!c || !r) return null;
      return L.circle(toLL(c), { radius: r, color: g.color, weight: 2, fillOpacity: 0.15 });
    }
    const pts = g.geometry?.points || [];
    if (pts.length < 3) return null;
    return L.polygon(pts.map(toLL), { color: g.color, weight: 2, fillOpacity: 0.15 });
  }

  function renderShapes() {
    if (!map) return;
    layers.clearLayers();
    for (const g of rows) {
      const shape = shapeOf(g);
      if (!shape) continue;
      shape.bindTooltip(g.name, { sticky: true });
      shape.on('click', () => selectRow(g));
      layers.addLayer(shape);
    }
    if (!map.hasLayer(layers)) map.addLayer(layers);
  }

  async function load() {
    loading = true; error = '';
    try {
      rows = await api('/geofences?active=true');
      renderShapes();
      fitAll();
    } catch (e) { error = e.message; }
    loading = false;
  }

  async function loadEvents() {
    eventsLoading = true;
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (eventGeofenceId) params.set('geofence_id', eventGeofenceId);
      if (eventType) params.set('event_type', eventType);
      events = await api(`/geofences/events?${params.toString()}`);
    } catch (e) { error = e.message; }
    eventsLoading = false;
  }

  function fitAll() {
    const bounds = L.latLngBounds([]);
    for (const g of rows) {
      const s = shapeOf(g);
      if (s) bounds.extend(s.getBounds());
    }
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.3));
  }

  function clearDraft() {
    if (draftLayer) { map.removeLayer(draftLayer); draftLayer = null; }
    for (const m of draftMarkers) map.removeLayer(m);
    draftMarkers = [];
    draftPoints = [];
    circleCenter = null;
    circleRadius = null;
  }

  function clearEditLayers() {
    if (editLayer) { map.removeLayer(editLayer); editLayer = null; }
    for (const m of editMarkers) map.removeLayer(m);
    editMarkers = [];
  }

  function rebuildEditLayer() {
    if (!map || !editPoints) return;
    if (editLayer) {
      editLayer.setLatLngs(editPoints.map(toLL));
    } else {
      editLayer = L.polyline(editPoints.map(toLL), { color: '#f97316', weight: 2 }).addTo(map);
    }
  }

  function addEditMarker(ll, idx) {
    const m = L.marker(ll, { draggable: true }).addTo(map);
    m.on('drag', () => {
      editPoints[idx] = [m.getLatLng().lat, m.getLatLng().lng];
      rebuildEditLayer();
    });
    editMarkers.push(m);
  }

  function setMode(m) {
    mode = m;
    clearDraft();
    clearEditLayers();
    notice = m === 'polygon'
      ? 'Clic en el mapa para agregar vértices. Usa "Terminar" con al menos 3 puntos.'
      : m === 'circle'
        ? 'Clic para colocar el centro y otro clic para definir el radio.'
        : m === 'editpoly'
          ? 'Arrastra los vértices o haz clic en el mapa para agregar nuevos.'
          : '';
  }

  function onMapClick(e) {
    if (mode === 'editpoly' && editPoints) {
      editPoints.push([e.latlng.lat, e.latlng.lng]);
      addEditMarker([e.latlng.lat, e.latlng.lng], editPoints.length - 1);
      rebuildEditLayer();
      return;
    }
    if (mode === 'polygon') {
      draftPoints.push([e.latlng.lat, e.latlng.lng]);
      draftMarkers.push(L.marker(e.latlng).addTo(map));
      if (draftLayer) map.removeLayer(draftLayer);
      draftLayer = L.polyline(draftPoints.map(toLL), { color: '#f97316', dashArray: '6 6' }).addTo(map);
    } else if (mode === 'circle') {
      if (!circleCenter) {
        circleCenter = [e.latlng.lat, e.latlng.lng];
        draftMarkers.push(L.marker(e.latlng).addTo(map));
      } else {
        circleRadius = Math.round(map.distance(circleCenter, [e.latlng.lat, e.latlng.lng]));
        if (draftLayer) map.removeLayer(draftLayer);
        draftLayer = L.circle(circleCenter, { radius: circleRadius, color: '#f97316', dashArray: '6 6' }).addTo(map);
      }
    }
  }

  function draftReady() {
    if (mode === 'polygon') return draftPoints.length >= 3;
    if (mode === 'circle') return !!circleCenter && circleRadius > 0;
    return false;
  }

  function finishDraft() {
    if (!draftReady()) {
      notice = mode === 'polygon' ? 'Se necesitan al menos 3 vértices.' : 'Define centro y radio de la geocerca.';
      return;
    }
    editingId = null;
    formName = '';
    formRadius = mode === 'circle' ? String(circleRadius) : '';
    showForm = true;
  }

  function selectRow(g) {
    const s = shapeOf(g);
    if (!s) return;
    map.fitBounds(s.getBounds().pad(0.5));
    s.openTooltip();
  }

  function startEdit(g) {
    editingId = g.id;
    formName = g.name;
    formColor = g.color || COLORS[0];
    editPoints = null;
    if (g.kind === 'circle') {
      mode = 'none';
      formRadius = String(g.geometry?.radius_m || '');
      circleCenter = g.geometry?.center || null;
    } else {
      formRadius = '';
      const pts = (g.geometry?.points || []).map(p => [p[0], p[1]]);
      if (pts.length >= 3) {
        mode = 'editpoly';
        editPoints = pts;
        editLayer = L.polyline(pts.map(toLL), { color: g.color || '#f97316', weight: 2 }).addTo(map);
        pts.forEach((p, i) => addEditMarker(toLL(p), i));
      } else {
        mode = 'polygon';
      }
    }
    showForm = true;
    notice = g.kind === 'polygon' ? 'Arrastra los vértices o haz clic en el mapa para agregar puntos.' : '';
  }

  function endEditDraw() { setMode('none'); }
  function discardEditDraw() { editPoints = null; setMode('none'); notice = 'Geometría original conservada.'; }

  async function save() {
    if (!formName.trim()) { error = 'El nombre es obligatorio'; return; }
    saving = true; error = '';
    try {
      let kind, geometry;
      if (editingId) {
        const g = rows.find(r => r.id === editingId);
        kind = g.kind;
        geometry = g.geometry;
        if (kind === 'circle') {
          const r = Number(formRadius);
          if (!r || r <= 0) throw new Error('El radio debe ser mayor a 0');
          geometry = { center: geometry.center, radius_m: r };
        } else if (editPoints && editPoints.length >= 3) {
          geometry = { points: editPoints };
        }
      } else if (mode === 'polygon') {
        kind = 'polygon';
        geometry = { points: draftPoints };
      } else {
        kind = 'circle';
        const r = Number(formRadius) || circleRadius;
        if (!circleCenter || !r || r <= 0) throw new Error('Geocerca de círculo incompleta');
        geometry = { center: circleCenter, radius_m: r };
      }
      const body = { name: formName.trim(), kind, geometry, color: formColor, active: true };
      if (editingId) await api(`/geofences/${editingId}`, { method: 'PUT', body });
      else await api('/geofences', { method: 'POST', body });
      showForm = false;
      editingId = null;
      editPoints = null;
      setMode('none');
      await load();
    } catch (e) { error = e.message; }
    saving = false;
  }

  async function remove(g) {
    if (!confirm(`¿Eliminar la geocerca "${g.name}"?`)) return;
    try { await api(`/geofences/${g.id}`, { method: 'DELETE' }); if (editingId === g.id) showForm = false; await load(); }
    catch (e) { error = e.message; }
  }

  function updateMeMarker(lat, lng) {
    if (!map) return;
    if (meMarker) {
      meMarker.setLatLng([lat, lng]);
      return;
    }
    meMarker = L.marker([lat, lng]).addTo(map);
    meMarker.bindTooltip('Tu ubicación');
  }

  async function trackPosition(lat, lng, accuracy) {
    const result = await api('/geofences/track', {
      method: 'POST',
      body: { lat, lng, accuracy_m: accuracy }
    });
    checkResult = { lat, lng, matches: result.inside || [] };
    if (result.events?.length) {
      const latest = result.events[0];
      lastEventNotice = `${latest.event_type === 'enter' ? 'Entrada' : 'Salida'}: ${latest.geofence?.name || 'geocerca'}`;
      await loadEvents();
    }
  }

  function handlePosition(position) {
    if (destroyed || !position?.coords) return;
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    updateMeMarker(lat, lng);

    const now = Date.now();
    const point = [lat, lng];
    const enoughTime = now - lastTrackAt >= 10000;
    const enoughDistance = !lastTrackPoint || distanceM(lastTrackPoint, point) >= 15;
    if (!enoughTime && !enoughDistance) return;
    lastTrackAt = now;
    lastTrackPoint = point;

    trackQueue = trackQueue
      .then(() => trackPosition(lat, lng, position.coords.accuracy))
      .catch(e => { if (!destroyed) error = e.message || 'No se pudo registrar la ubicación'; });
  }

  function handleGeoError(e) {
    checkingLoc = false;
    if (e.code === 1) {
      stopTracking();
      error = 'Permiso de ubicación denegado';
    } else {
      error = 'No se pudo obtener la ubicación';
    }
  }

  function startTracking() {
    if (tracking || !navigator.geolocation) {
      if (!navigator.geolocation) error = 'Geolocalización no disponible en este navegador';
      return;
    }
    try {
      watchId = navigator.geolocation.watchPosition(handlePosition, handleGeoError, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
        distanceFilter: 10
      });
      tracking = true;
      if (mode === 'none') notice = 'Seguimiento activo: las entradas y salidas se registrarán automáticamente.';
    } catch {
      error = 'No se pudo iniciar el seguimiento de ubicación';
    }
  }

  function stopTracking() {
    if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    tracking = false;
    if (notice.startsWith('Seguimiento activo')) notice = '';
  }

  function toggleTracking() {
    if (tracking) stopTracking();
    else startTracking();
  }

  async function myLocation() {
    checkResult = null;
    if (!navigator.geolocation) { error = 'Geolocalización no disponible en este navegador'; return; }
    checkingLoc = true; error = '';
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }));
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      updateMeMarker(lat, lng);
      meMarker?.openTooltip();
      await trackPosition(lat, lng, pos.coords.accuracy);
      lastTrackAt = Date.now();
      lastTrackPoint = [lat, lng];
      if (checkResult.matches.length) {
        const s = shapeOf(checkResult.matches[0]);
        if (s) map.fitBounds(s.getBounds().pad(0.5));
      } else {
        map.setView([lat, lng], 15);
      }
    } catch (e) {
      error = e.code === 1 ? 'Permiso de ubicación denegado' : (e.message || 'No se pudo obtener la ubicación');
    }
    checkingLoc = false;
  }

  function cancelForm() {
    showForm = false;
    editingId = null;
    editPoints = null;
    setMode('none');
  }

  onMount(() => {
    map = L.map('map').setView([19.4326, -99.1332], 12); // Ciudad de México por defecto
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.on('click', onMapClick);
    load().finally(() => {
      loadEvents();
      startTracking();
    });
    return () => {
      destroyed = true;
      stopTracking();
      map?.off('click', onMapClick);
      map?.remove();
    };
  });

  onDestroy(() => {
    destroyed = true;
    stopTracking();
  });
</script>

<div class="toolbar">
  <h2 class="page-title" style="margin:0;flex:1">Geocercas</h2>
  {#if mode === 'none'}
    <button class="secondary" on:click={() => setMode('polygon')}>Dibujar polígono</button>
    <button class="secondary" on:click={() => setMode('circle')}>Dibujar círculo</button>
  {:else if mode === 'editpoly'}
    <button class="secondary" on:click={endEditDraw}>Listo</button>
    <button class="secondary" on:click={discardEditDraw}>Descartar cambios</button>
  {:else}
    {#if mode === 'polygon' && draftPoints.length >= 3}
      <button on:click={finishDraft}>Terminar polígono ({draftPoints.length} pts)</button>
    {:else if mode === 'circle' && draftReady()}
      <button on:click={finishDraft}>Terminar círculo ({Math.round(circleRadius)} m)</button>
    {/if}
    <button class="secondary" on:click={() => setMode('none')}>Cancelar dibujo</button>
  {/if}
  <button class="secondary" on:click={toggleTracking}>
    {tracking ? 'Detener seguimiento' : 'Seguir ubicación'}
  </button>
  <button class="secondary" on:click={myLocation} disabled={checkingLoc}>
    {checkingLoc ? 'Obteniendo…' : 'Mi ubicación'}
  </button>
</div>

{#if notice}<div class="card muted">{notice}</div>{/if}
{#if error}<div class="error-msg card">{error}</div>{/if}
{#if checkResult}
  <div class="card">
    {#if checkResult.matches.length}
      <span class="badge ok">Dentro de {checkResult.matches.length} geocerca(s):</span>
      {checkResult.matches.map(g => g.name).join(', ')}
    {:else}
      <span class="badge warn">Fuera de toda geocerca</span>
      <span class="muted"> ({checkResult.lat.toFixed(5)}, {checkResult.lng.toFixed(5)})</span>
    {/if}
  </div>
{/if}
{#if lastEventNotice}
  <div class="card"><span class="badge ok">Último evento</span> {lastEventNotice}</div>
{/if}

<div class="grid cols-2">
  <div class="card" style="padding:0;overflow:hidden">
    <div id="map" style="height:520px;width:100%"></div>
  </div>

  <div>
    {#if showForm}
      <div class="card">
        <h3>{editingId ? 'Editar geocerca' : 'Guardar geocerca'}</h3>
        <label for="gf-name">Nombre *</label>
        <input id="gf-name" bind:value={formName} placeholder="Ej. Zona de entrega centro" />
        {#if editingId}
          <label for="gf-radius">Radio (metros)</label>
          <input id="gf-radius" type="number" min="1" bind:value={formRadius} disabled={rows.find(r => r.id === editingId)?.kind !== 'circle'} />
        {:else if mode === 'circle'}
          <label for="gf-radius">Radio (metros)</label>
          <input id="gf-radius" type="number" min="1" bind:value={formRadius} placeholder={circleRadius ? String(circleRadius) : ''} />
        {/if}
        <label>Color</label>
        <div class="flex" style="flex-wrap:wrap;margin-bottom:10px">
          {#each COLORS as c}
            <button type="button" class="secondary" style="padding:6px 12px;background:{formColor === c ? c : 'var(--panel2)'};border-color:{c}"
              on:click={() => formColor = c} aria-label="Color {c}"></button>
          {/each}
        </div>
        <div class="flex">
          <button on:click={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          <button class="secondary" on:click={cancelForm}>Cancelar</button>
        </div>
      </div>
    {/if}

    <div class="card" style="overflow-x:auto">
      {#if loading}<p class="muted">Cargando…</p>
      {:else if rows.length === 0}<p class="muted">Sin geocercas. Dibuja una en el mapa para empezar.</p>
      {:else}
        <table>
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Color</th><th></th></tr></thead>
          <tbody>
            {#each rows as g}
              <tr>
                <td><strong>{g.name}</strong></td>
                <td>{g.kind === 'circle' ? `Círculo · ${Math.round(g.geometry?.radius_m || 0)} m` : 'Polígono'}</td>
                <td><span class="badge" style="border-color:{g.color};color:{g.color}">{g.color}</span></td>
                <td style="white-space:nowrap">
                  <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={() => startEdit(g)}>Editar</button>
                  <button class="danger" style="padding:4px 10px;font-size:12px;margin-left:6px" on:click={() => remove(g)}>✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
</div>

<div class="card" style="overflow-x:auto">
  <p class="muted" style="margin-top:0">Los eventos se registran mientras esta página está abierta y el seguimiento de ubicación está activo.</p>
  <div class="toolbar" style="margin-bottom:12px">
    <h3 style="margin:0;flex:1">Historial de entradas y salidas</h3>
    <select bind:value={eventGeofenceId} on:change={loadEvents} style="width:auto;min-width:180px">
      <option value="">Todas las geocercas</option>
      {#each rows as g}<option value={g.id}>{g.name}</option>{/each}
    </select>
    <select bind:value={eventType} on:change={loadEvents} style="width:auto;min-width:130px">
      <option value="">Todos los eventos</option>
      <option value="enter">Entradas</option>
      <option value="exit">Salidas</option>
    </select>
    <button class="secondary" on:click={loadEvents} disabled={eventsLoading}>
      {eventsLoading ? 'Cargando…' : 'Actualizar'}
    </button>
  </div>

  {#if eventsLoading && events.length === 0}<p class="muted">Cargando eventos…</p>
  {:else if events.length === 0}<p class="muted">Aún no hay entradas ni salidas registradas.</p>
  {:else}
    <table>
      <thead><tr><th>Fecha</th><th>Geocerca</th><th>Usuario</th><th>Evento</th><th>Ubicación</th></tr></thead>
      <tbody>
        {#each events as e}
          <tr>
            <td>{fmtDate(e.created_at)}</td>
            <td><strong>{e.geofence?.name || 'Geocerca'}</strong></td>
            <td>{e.user?.name || e.user?.email || 'Usuario'}</td>
            <td><span class="badge {e.event_type === 'enter' ? 'ok' : 'warn'}">{e.event_type === 'enter' ? 'Entrada' : 'Salida'}</span></td>
            <td class="muted">{Number(e.latitude).toFixed(5)}, {Number(e.longitude).toFixed(5)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
