// Utilidades geográficas compartidas (geocercas de empleados y zonas de entrega).

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

// kind: 'circle' usa {center:[lat,lng], radius_m}; 'polygon' usa {points:[[lat,lng],...]}
function containsPoint(geo, kind, [lat, lng]) {
  if (kind === 'circle') {
    const c = geo.center || geo.points?.[0];
    const radius = Number(geo.radius_m || 0);
    return Boolean(c && radius > 0 && distanceM(c, [lat, lng]) <= radius);
  }
  const pts = geo.points || geo.polygon || [];
  return pts.length >= 3 && pointInPolygon([lat, lng], pts);
}

function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

module.exports = { distanceM, pointInPolygon, containsPoint, validCoordinates };
