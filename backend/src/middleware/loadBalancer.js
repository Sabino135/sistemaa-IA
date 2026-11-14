/**
 * Balanceador de cargas: limita la cantidad de peticiones concurrentes
 * que el servidor procesa simultáneamente. Cuando se alcanza el límite,
 * las peticiones nuevas esperan en cola hasta que se libere capacidad,
 * evitando saturación del pool de Supabase y del event loop.
 */
function loadBalancer(maxConcurrent) {
  let active = 0;
  const queue = [];

  function release() {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  }

  return function (req, res, next) {
    let released = false;
    function done() {
      if (released) return;
      released = true;
      release();
    }
    function run() {
      active++;
      res.on('finish', done);
      res.on('close', done);
      next();
    }

    if (active < maxConcurrent) {
      run();
    } else {
      queue.push(run);
      // Timeout de espera en cola (30s) para no acumular peticiones zombie
      setTimeout(() => {
        const idx = queue.indexOf(run);
        if (idx !== -1) {
          queue.splice(idx, 1);
          res.status(503).json({ error: 'Servidor ocupado, intente de nuevo' });
        }
      }, 30000).unref();
    }
  };
}

module.exports = { loadBalancer };
