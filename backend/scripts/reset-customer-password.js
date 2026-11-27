/**
 * Genera un enlace seguro de restablecimiento de contraseña para un
 * usuario de Supabase Auth (típicamente cliente@daenerys.com).
 *
 * Uso:
 *   node scripts/reset-customer-password.js [email]
 *
 * El enlace generado permite al usuario definir una contraseña nueva
 * desde la propia app (flujo PASSWORD_RECOVERY → ResetPassword).
 * No se imprime ni almacena ninguna contraseña.
 *
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env (raíz).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const config = require('../src/config');

const email = process.argv[2] || 'cliente@daenerys.com';

async function main() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Localizar el usuario por email
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const user = (list.users || []).find(u => u.email === email);
  if (!user) {
    console.error(`No existe un usuario de Supabase Auth con email ${email}`);
    process.exit(1);
  }

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: process.env.APP_URL || 'https://tudominio.vercel.app/' }
  });
  if (error) throw error;

  const link = data.properties?.action_link || data.action_link;
  console.log('Usuario encontrado:', user.id, email);
  console.log('Enlace de restablecimiento (válido por tiempo limitado):');
  console.log(link);
  console.log('\nCompártelo con el usuario por un canal seguro. Al abrirlo en la');
  console.log('app podrá definir su nueva contraseña. No se generó ni guardó');
  console.log('ninguna contraseña en texto plano.');
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
