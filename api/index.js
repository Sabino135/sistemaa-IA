// Entrada serverless para Vercel: expone la app Express como función.
// Las rutas /api/* se reescriben a esta función desde vercel.json.
const app = require('../backend/src/app');

module.exports = app;
