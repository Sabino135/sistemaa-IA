/**
 * Migración de identidad NEGOCIO → DAENERYS.
 *
 * Renombra las cuentas de Supabase Auth y sus perfiles en public.users de
 * *@negocio.com a *@daenerys.com CONSERVANDO el mismo id de usuario, por lo
 * que pedidos, ventas y demás relaciones no se rompen.
 *
 * Uso:  node backend/scripts/migrate-identity.js
 * Requiere backend/.env (o .env raíz) con SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY configurados.
 *
 * Notas:
 * - Si el nuevo correo ya existe en Supabase Auth, esa cuenta se omite.
 * - daenerys.com debe estar verificado como dominio de envío en Supabase
 *   (Authentication → Emails) para que funcionen los correos de
 *   confirmación/recuperación. Mientras tanto el login con contraseña
 *   funciona igual; solo los correos transaccionales pueden fallar.
 * - Es idempotente: ejecutarlo dos veces no duplica ni rompe nada.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const config = require('../src/config');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false }
});

// Mapeo explícito de las cuentas de prueba conocidas.
const RENAME = {
  'admin@negocio.com': 'admin@daenerys.com',
  'cliente@negocio.com': 'cliente@daenerys.com'
};

async function main() {
  console.log('Migrando identidad negocio.com → daenerys.com...\n');

  const { data: list, error } = await supabase.auth.admin.listUsers();
  if (error) throw new Error(`listUsers: ${error.message}`);
  const users = list?.users || [];

  // Cualquier otra cuenta @negocio.com también se migra al mismo dominio.
  const targets = users.filter(u => {
    const email = (u.email || '').toLowerCase();
    return email.endsWith('@negocio.com');
  });

  if (targets.length === 0) {
    console.log('No se encontraron cuentas @negocio.com. Nada que migrar.');
    return;
  }

  for (const u of targets) {
    const oldEmail = u.email.toLowerCase();
    const newEmail = RENAME[oldEmail] || oldEmail.replace(/@negocio\.com$/, '@daenerys.com');

    // ¿Ya existe la cuenta destino?
    const exists = users.some(x => x.id !== u.id && (x.email || '').toLowerCase() === newEmail);
    if (exists) {
      console.log(`  OMITIDA ${oldEmail} → ${newEmail} (el correo destino ya existe)`);
      continue;
    }

    // 1) Auth: cambiar email conservando el id (email_confirm para no pedir re-verificación)
    const { error: aErr } = await supabase.auth.admin.updateUserById(u.id, {
      email: newEmail,
      email_confirm: true
    });
    if (aErr) {
      console.log(`  ERROR auth ${oldEmail} → ${newEmail}: ${aErr.message}`);
      continue;
    }

    // 2) Perfil operativo: sincronizar email (el rol y relaciones se conservan)
    const { error: pErr } = await supabase
      .from('users').update({ email: newEmail }).eq('id', u.id);
    if (pErr) console.log(`  AVISO perfil ${u.id}: ${pErr.message} (actualízalo a mano)`);

    console.log(`  OK ${oldEmail} → ${newEmail} (id ${u.id} conservado)`);
  }

  console.log('\nListo. Cuentas de prueba:');
  console.log('  Panel admin: admin@daenerys.com');
  console.log('  Tienda:      cliente@daenerys.com');
  console.log('Las contraseñas no cambian.');
}

main().catch(err => { console.error(err); process.exit(1); });
