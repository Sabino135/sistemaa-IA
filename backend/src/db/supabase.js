const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Si faltan credenciales (p. ej. variables de entorno sin configurar en
// Vercel), createClient lanzaría una excepción al cargar el módulo y todas
// las rutas devolverían 500 sin diagnóstico. Exportamos un stub que falla
// de forma controlada: la app responde 503 vía middleware de config.
const configured = config.supabase.url && config.supabase.serviceRoleKey
  && !config.missingEnv.includes('SUPABASE_SERVICE_ROLE_KEY (inválida: se configuró la anon/publishable key)');

const supabase = configured
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: 'Supabase no configurado' } })
      },
      from: () => { throw new Error('Supabase no configurado: faltan variables de entorno'); }
    };

module.exports = { supabase };
