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
app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
