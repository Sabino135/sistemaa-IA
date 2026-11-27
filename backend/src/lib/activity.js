const { supabase } = require('../db/supabase');

/**
 * Registra una acción administrativa en activity_log.
 * Nunca lanza: el registro de auditoría no debe romper la operación
 * principal. Si la tabla aún no existe (migración pendiente), se omite.
 */
async function logActivity(req, action, entity = null, entityId = null, details = null) {
  try {
    await supabase.from('activity_log').insert({
      user_id: req?.user?.id || null,
      user_email: req?.user?.email || null,
      action,
      entity,
      entity_id: entityId != null ? String(entityId) : null,
      details: details || null
    });
  } catch (err) {
    console.warn('[activity] no se pudo registrar:', err?.message || err);
  }
}

module.exports = { logActivity };
