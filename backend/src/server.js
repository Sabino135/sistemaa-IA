const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`[server] API escuchando en http://localhost:${config.port}/api`);
});
