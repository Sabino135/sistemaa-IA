// Entrada para Vercel Serverless Functions.
// Vercel detecta /api/index.js como función y enruta /api/* aquí.
const app = require('../backend/src/app');

module.exports = app;
