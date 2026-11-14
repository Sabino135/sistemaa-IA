const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { loadBalancer } = require('./middleware/loadBalancer');
const routes = require('./routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Balanceador de cargas: limita concurrencia y tasa de peticiones
app.use(loadBalancer(config.load.maxConcurrent));
app.use(rateLimit({
  windowMs: config.load.rateLimitWindowMs,
  max: config.load.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, intente más tarde' }
}));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Configuración incompleta (variables de entorno faltantes en Vercel):
// respondemos 503 con el detalle en lugar de dejar que cada ruta explote.
app.use('/api', (req, res, next) => {
  if (config.missingEnv?.length) {
    return res.status(503).json({
      error: 'Backend mal configurado: faltan variables de entorno',
      missing: config.missingEnv
    });
  }
  next();
});

app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
