const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Si faltan credenciales (p. ej. variables de entorno sin configurar en
// Vercel), createClient lanzaría una excepción al cargar el módulo y todas
// las rutas devolverían 500 sin diagnóstico. Exportamos un stub que falla
// de forma controlada: la app responde 503 vía middleware de config.
// Cualquier problema de configuración de Supabase (variable ausente, clave
// anon en vez de service_role, proyecto distinto entre URL y clave, o
// backend apuntando a un proyecto distinto del frontend) debe producir el
// stub: la app responde 503 con el detalle en missingEnv en lugar de un
// 401 engañoso al verificar sesiones.
const supabaseMisconfigured = config.missingEnv.some(m => m.startsWith('SUPABASE'));
const configured = config.supabase.url && config.supabase.serviceRoleKey && !supabaseMisconfigured;

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
