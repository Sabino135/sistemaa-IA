<script>
  import { onMount } from 'svelte';
  import { supabase } from '../../lib/supabase';
  import { api, fmtMoney, fmtDate } from '../../lib/api';
  import { navigate } from '../../lib/store';
  import { storeSettings, loadStoreSettings } from '../../lib/storefront';
  import WhatsAppButton from '../../lib/WhatsAppButton.svelte';

  const ORDER_STATUS = {
    received: 'Recibido', preparing: 'Preparando', ready: 'Listo',
    on_the_way: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado'
  };
  const PAY_STATUS = {
    pending: 'Pago pendiente', review: 'Pago en revisión', paid: 'Pago confirmado', rejected: 'Pago rechazado',
    cancelled: 'Pago cancelado', refunded: 'Reembolsado'
  };

  let mode = 'login'; // 'login' | 'register'
  let name = '';
  let email = '';
  let password = '';
  let showPassword = false;
  let error = '';
  let info = '';
  let loading = false;

  let customer = null;
  let orders = [];
  let ordersLoading = false;
  let ordersError = '';

  // Cambio de contraseña propio del cliente
  let showPwForm = false;
  let pwCurrent = '';
  let pwNew = '';
  let pwConfirm = '';
  let pwLoading = false;
  let pwError = '';
  let pwOk = '';

  async function changePassword(e) {
    e.preventDefault();
    pwError = ''; pwOk = '';
    if (pwNew.length < 8) { pwError = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
    if (pwNew !== pwConfirm) { pwError = 'Las contraseñas nuevas no coinciden.'; return; }
    pwLoading = true;
    try {
      // Verificar la contraseña actual re-autenticando
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: customer.email, password: pwCurrent });
      if (signErr) { pwError = 'La contraseña actual es incorrecta.'; pwLoading = false; return; }
      const { error: updErr } = await supabase.auth.updateUser({ password: pwNew });
      if (updErr) throw updErr;
      pwOk = 'Contraseña actualizada correctamente.';
      pwCurrent = pwNew = pwConfirm = '';
      showPwForm = false;
    } catch (err) { pwError = err.message || 'No se pudo cambiar la contraseña.'; }
    pwLoading = false;
  }

  async function loadOrders() {
    if (!customer) return;
    ordersLoading = true; ordersError = '';
    try {
      orders = await api('/store/orders/mine');
    } catch (e) { ordersError = e.message; }
    ordersLoading = false;
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    customer = data.session?.user || null;
    if (customer) await loadOrders();
  }

  async function submit(e) {
    e.preventDefault();
    loading = true; error = ''; info = '';
    try {
      if (mode === 'register') {
        const { data, error: authErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, is_customer: true } }
        });
        if (authErr) throw authErr;
        if (data.session) {
          customer = data.user;
          await loadOrders();
          info = 'Cuenta creada. Ya puedes ver tus pedidos.';
        } else {
          info = 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.';
          mode = 'login';
        }
      } else {
        const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
        if (authErr) throw authErr;
        customer = data.user;
        await loadOrders();
      }
    } catch (err) { error = err.message; }
    loading = false;
  }

  async function logout() {
    await supabase.auth.signOut();
    customer = null;
    orders = [];
    password = '';
    navigate('/tienda');
  }

  onMount(() => {
    loadStoreSettings().catch(() => {});
    refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      customer = session?.user || null;
      if (customer) loadOrders();
      else orders = [];
    });
    return () => subscription.unsubscribe();
  });
</script>

<div class="card store-account">
  {#if customer}
    <div class="flex" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <h2 style="margin:0">Hola{customer.user_metadata?.name ? ', ' + customer.user_metadata.name : ''}</h2>
        <p class="muted" style="margin:4px 0 0">{customer.email}</p>
      </div>
      <div class="flex" style="flex-wrap:wrap">
        <button class="secondary" on:click={() => navigate('/tienda')}>Seguir comprando</button>
        <button class="secondary" on:click={() => showPwForm = !showPwForm}>Cambiar contraseña</button>
        <button class="secondary" on:click={logout}>Cerrar sesión</button>
      </div>
    </div>

    {#if showPwForm}
      <div class="card" style="background:var(--panel2);margin-top:14px">
        <h4 style="margin-top:0">Cambiar contraseña</h4>
        {#if pwError}<div class="error-msg">{pwError}</div>{/if}
        {#if pwOk}<div class="info-msg">{pwOk}</div>{/if}
        <form on:submit={changePassword}>
          <label for="pw-cur">Contraseña actual</label>
          <input id="pw-cur" type="password" bind:value={pwCurrent} autocomplete="current-password" required />
          <label for="pw-new">Nueva contraseña (mín. 8 caracteres)</label>
          <input id="pw-new" type="password" bind:value={pwNew} minlength="8" autocomplete="new-password" required />
          <label for="pw-conf">Confirmar nueva contraseña</label>
          <input id="pw-conf" type="password" bind:value={pwConfirm} minlength="8" autocomplete="new-password" required />
          <div class="flex">
            <button type="submit" disabled={pwLoading}>{pwLoading ? 'Guardando…' : 'Actualizar contraseña'}</button>
            <button type="button" class="secondary" on:click={() => { showPwForm = false; pwError = ''; pwOk = ''; }}>Cancelar</button>
          </div>
        </form>
      </div>
    {/if}

    <h3 style="margin-top:18px">Mis pedidos</h3>
    {#if ordersError}<div class="error-msg">{ordersError}</div>{/if}
    {#if ordersLoading}<p class="muted">Cargando pedidos…</p>
    {:else if orders.length === 0}<p class="muted">Aún no tienes pedidos en línea.</p>
    {:else}
      <div class="store-account-orders">
        {#each orders as o}
          <button class="store-account-order" on:click={() => navigate(`/pedido/${o.id}`)}>
            <span><strong>#{o.order_number ?? o.id.slice(0, 8)}</strong><br /><span class="muted">{fmtDate(o.created_at)}</span></span>
            <span class="badge {o.status === 'delivered' ? 'ok' : o.status === 'cancelled' ? 'err' : 'warn'}">{ORDER_STATUS[o.status] || o.status}</span>
            <span class="badge {o.payment_status === 'paid' ? 'ok' : 'warn'}">{PAY_STATUS[o.payment_status] || o.payment_status}</span>
            <strong>{fmtMoney(o.total)}</strong>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    <h2 style="margin-top:0">{mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}</h2>
    <p class="muted">Guarda tus datos y consulta tus pedidos en línea.</p>
    {#if error}<div class="error-msg">{error}</div>{/if}
    {#if info}<div class="info-msg">{info}</div>{/if}

    <form on:submit={submit}>
      {#if mode === 'register'}
        <label for="acc-name">Nombre</label>
        <input id="acc-name" bind:value={name} autocomplete="name" required />
      {/if}
      <label for="acc-email">Correo electrónico</label>
      <input id="acc-email" type="email" bind:value={email} autocomplete="email" required />
      <label for="acc-pass">Contraseña</label>
      <div class="input-wrap" style="margin-bottom:12px">
        <input id="acc-pass" type={showPassword ? 'text' : 'password'} value={password} on:input={(e) => password = e.target.value} minlength="6" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        <button type="button" class="eye-btn" on:click={() => showPassword = !showPassword} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {#if showPassword}Ocultar{:else}Ver{/if}
        </button>
      </div>
      <button type="submit" style="width:100%" disabled={loading}>{loading ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
    </form>

    <p class="muted" style="margin-top:12px">
      {#if mode === 'login'}¿No tienes cuenta? <button type="button" class="link-btn" on:click={() => { mode = 'register'; error = ''; info = ''; }}>Regístrate</button>
      {:else}¿Ya tienes cuenta? <button type="button" class="link-btn" on:click={() => { mode = 'login'; error = ''; info = ''; }}>Inicia sesión</button>{/if}
    </p>
  {/if}
</div>

<p class="muted" style="text-align:center">
  ¿Necesitas ayuda? <WhatsAppButton phone={$storeSettings?.whatsapp || $storeSettings?.phone} label="Escríbenos por WhatsApp" small />
</p>
