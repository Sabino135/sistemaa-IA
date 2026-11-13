const express = require('express');
const { supabase } = require('../db/supabase');
const { authRequired } = require('../middleware/auth');
const { crudRouter } = require('./crud');

const router = express.Router();
router.use(authRequired);

// Distancia en metros entre dos coordenadas [lat, lng] (fórmula de Haversine)
function distanceM([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Ray casting: punto [lat,lng] dentro de polígono [[lat,lng],...]
function pointInPolygon(point, polygon) {
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersect =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersect) inside = !inside;
  }
  return inside;
}

function containsPoint(geo, kind, [lat, lng]) {
  if (kind === 'circle') {
    const c = geo.center || geo.points?.[0];
    const radius = Number(geo.radius_m || 0);
    return c && radius > 0 && distanceM(c, [lat, lng]) <= radius;
  }
  const pts = geo.points || [];
  return pts.length >= 3 && pointInPolygon([lat, lng], pts);
}

// POST /geofences/check  { lat, lng } -> geocercas activas que contienen el punto
router.post('/check', async (req, res) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!validCoordinates(lat, lng)) {
      return res.status(400).json({ error: 'lat y lng válidos son requeridos' });
    }
    const { data, error } = await supabase
      .from('geofences')
      .select('*')
      .eq('active', true);
    if (error) throw error;
    const matches = (data || []).filter(g => containsPoint(g.geometry || {}, g.kind, [lat, lng]));
    res.json(matches);
  } catch (err) {
    console.error('[geofences] check', err);
    res.status(500).json({ error: 'Error al verificar geocercas' });
  }
});

const EVENT_SELECT = '*, geofence:geofences(name,color), user:users(name,email)';

function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function latestEvent(geofenceId, userId) {
  const { data, error } = await supabase
    .from('geofence_events')
    .select('event_type, created_at')
    .eq('geofence_id', geofenceId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// GET /geofences/events?geofence_id=&user_id=&event_type=&limit= -> historial de entradas/salidas
router.get('/events', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    let q = supabase.from('geofence_events').select(EVENT_SELECT);
    if (req.query.geofence_id) q = q.eq('geofence_id', req.query.geofence_id);
    if (req.query.user_id) q = q.eq('user_id', req.query.user_id);
    if (req.query.event_type) {
      if (!['enter', 'exit'].includes(req.query.event_type)) {
        return res.status(400).json({ error: 'event_type debe ser enter o exit' });
      }
      q = q.eq('event_type', req.query.event_type);
    }
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[geofences] events', err);
    res.status(500).json({ error: 'Error al consultar eventos de geocercas' });
  }
});

// POST /geofences/track { lat, lng, accuracy_m } -> registra entradas/salidas del usuario autenticado
router.post('/track', async (req, res) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const accuracy = Number.isFinite(Number(req.body.accuracy_m)) ? Number(req.body.accuracy_m) : null;
    if (!validCoordinates(lat, lng)) {
      return res.status(400).json({ error: 'lat y lng válidos son requeridos' });
    }

    const { data: geofences, error: geofencesError } = await supabase
      .from('geofences')
      .select('*')
      .eq('active', true);
    if (geofencesError) throw geofencesError;

    const checks = await Promise.all((geofences || []).map(async g => {
      const inside = containsPoint(g.geometry || {}, g.kind, [lat, lng]);
      const last = await latestEvent(g.id, req.user.id);
      let eventType = null;
      if (inside && last?.event_type !== 'enter') eventType = 'enter';
      else if (!inside && last?.event_type === 'enter') eventType = 'exit';
      return { geofence: g, inside, eventType };
    }));

    const inserts = checks
      .filter(c => c.eventType)
      .map(c => ({
        geofence_id: c.geofence.id,
        user_id: req.user.id,
        event_type: c.eventType,
        latitude: lat,
        longitude: lng,
        accuracy_m: accuracy
      }));

    let events = [];
    if (inserts.length) {
      const { error } = await supabase.from('geofence_events').insert(inserts);
      if (error) throw error;
      events = checks
        .filter(c => c.eventType)
        .map(c => ({
          event_type: c.eventType,
          created_at: new Date().toISOString(),
          latitude: lat,
          longitude: lng,
          geofence: c.geofence,
          user: { name: req.user.name, email: req.user.email }
        }));
    }

    res.json({
      inside: checks.filter(c => c.inside).map(c => c.geofence),
      events
    });
  } catch (err) {
    console.error('[geofences] track', err);
    res.status(500).json({ error: 'Error al registrar geocercas' });
  }
});

router.use(crudRouter({
  tabla: 'geofences',
  updatable: ['name', 'kind', 'geometry', 'color', 'active'],
  searchFields: ['name']
}));

module.exports = router;
