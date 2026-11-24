require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const B = 'http://localhost:3000/api';
const H = t => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' });

(async () => {
  const c = await sb.auth.signInWithPassword({ email: 'cliente@daenerys.com', password: 'cliente123' });
  if (c.error) { console.log('cliente login FAIL:', c.error.message); return; }
  const t = c.data.session.access_token;
  const me = await (await fetch(B + '/auth/me', { headers: H(t) })).json();
  console.log('cliente role:', me.role);
  for (const p of ['/orders', '/products', '/users', '/orders/settings']) {
    const r = await fetch(B + p, { headers: H(t) });
    console.log('GET', p, '->', r.status);
  }
  let w = await fetch(B + '/products', { method: 'POST', headers: H(t), body: JSON.stringify({ name: 'hack' }) });
  console.log('POST /products (cliente) ->', w.status);
  w = await fetch(B + '/orders/settings', { method: 'PUT', headers: H(t), body: JSON.stringify({ store_name: 'hack' }) });
  console.log('PUT /orders/settings (cliente) ->', w.status);
  w = await fetch(B + '/orders', { method: 'GET', headers: H(t) });
  console.log('GET /orders (cliente) ->', w.status);

  const a = await sb.auth.signInWithPassword({ email: 'admin@daenerys.com', password: 'admin123' });
  const at = a.data.session.access_token;
  const put = await fetch(B + '/orders/settings', { method: 'PUT', headers: H(at), body: JSON.stringify({ store_name: 'Daenerys', business_hours: 'Lun-Dom 11-22' }) });
  console.log('PUT settings admin (campo nuevo) ->', put.status, JSON.stringify(await put.json()).slice(0, 200));
  const pm = await fetch(B + '/payment-methods', { headers: H(at) });
  console.log('GET /payment-methods admin ->', pm.status);
})();
