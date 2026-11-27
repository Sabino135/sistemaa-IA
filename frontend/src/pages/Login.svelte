<script>
  import { loginWithGoogle, loginWithEmail, resetPassword, registerWithEmail, navigate } from '../lib/store';
  import Logo from '../lib/Logo.svelte';

  let mode = 'login'; // 'login' | 'forgot' | 'register'
  let name = '';
  let email = '';
  let password = '';
  let showPassword = false;
  let error = '';
  let info = '';
  let loading = false;

  async function submit(e) {
    e.preventDefault();
    loading = true; error = ''; info = '';
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else if (mode === 'register') {
        const data = await registerWithEmail(name, email, password);
        if (!data.session) {
          info = 'Cuenta creada. Revisa tu correo para confirmar tu cuenta.';
          mode = 'login';
        }
      } else {
        await resetPassword(email);
        info = 'Te enviamos un correo con el enlace para restablecer tu contraseña.';
        mode = 'login';
      }
    } catch (err) { error = err.message; }
    loading = false;
  }

  async function google() {
    error = '';
    try { await loginWithGoogle(); }
    catch (err) { error = err.message; }
  }
</script>

<div class="login-screen">
  <!-- Panel visual -->
  <aside class="brand-panel">
    <div class="brand-top">
      <Logo src="/images/logo.png" alt="DAENERYS" width="40" height="40" />
      <span class="brand-name">DAENERYS</span>
    </div>
    <div class="brand-bottom">
      <p class="tagline">Tu negocio, bajo control.</p>
      <p class="brand-sub">Punto de venta, inventario y reportes para tu restaurante — todo en un solo lugar.</p>
    </div>
    <p class="tagline-mobile">Tu negocio, bajo control.</p>
  </aside>

  <!-- Panel del formulario -->
  <main class="form-panel">
    <div class="form-card">
      <div class="login-brand">
        <Logo src="/images/logo.png" alt="DAENERYS BURGERS & BURRITOS" />
        <div class="login-tagline">BURGER &amp; BURRITOS | Punto de Venta y Administración</div>
      </div>
      {#if mode === 'login'}
        <h1>Iniciar sesión</h1>
        <p class="muted">Accede al panel de administración de tu restaurante.</p>
      {:else if mode === 'register'}
        <h1>Crear cuenta</h1>
        <p class="muted">Crea tu cuenta. El personal del negocio es dado de alta por un administrador.</p>
      {:else}
        <h1>Recuperar contraseña</h1>
        <p class="muted">Ingresa tu correo y te enviaremos un enlace para restablecerla.</p>
      {/if}

      {#if error}<div class="error-msg">{error}</div>{/if}
      {#if info}<div class="info-msg">{info}</div>{/if}

      {#if mode === 'login'}
        <button class="google-btn" on:click={google} disabled={loading} type="button">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continuar con Google
        </button>

        <div class="divider"><span>o con tu correo</span></div>
      {/if}

      <form on:submit={submit}>
        {#if mode === 'register'}
          <label for="name">Nombre</label>
          <div class="input-wrap">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <input id="name" type="text" bind:value={name} placeholder="Tu nombre" required autocomplete="name" />
          </div>
        {/if}
        <label for="email">Correo electrónico</label>
        <div class="input-wrap">
          <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          <input id="email" type="email" bind:value={email} placeholder="tu@correo.com" required autocomplete="email" />
        </div>

        {#if mode !== 'forgot'}
          <label for="pass">Contraseña</label>
          <div class="input-wrap">
            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input id="pass" type={showPassword ? 'text' : 'password'} value={password} on:input={(e) => password = e.target.value} placeholder="••••••••" required minlength="6" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} />
            <button type="button" class="eye-btn" on:click={() => showPassword = !showPassword} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {#if showPassword}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              {/if}
            </button>
          </div>
        {/if}

        {#if mode === 'login'}
          <div class="forgot-row">
            <button type="button" class="link-btn" on:click={() => { mode = 'forgot'; error = ''; info = ''; }}>¿Olvidaste tu contraseña?</button>
          </div>
        {:else}
          <div class="forgot-row">
            <button type="button" class="link-btn" on:click={() => { mode = 'login'; error = ''; info = ''; }}>← Volver a iniciar sesión</button>
          </div>
        {/if}

        <button class="submit-btn" type="submit" disabled={loading}>
          {loading ? 'Procesando…' : mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>
      </form>

      {#if mode === 'login'}
        <p class="note register-note">¿No tienes cuenta? <button type="button" class="link-btn" on:click={() => { mode = 'register'; error = ''; info = ''; }}>Regístrate</button></p>
      {/if}

      <p class="note">DAENERYS BURGERS &amp; BURRITOS · Punto de Venta y Administración</p>
      <p class="note"><button type="button" class="link-btn" on:click={() => navigate('/tienda')}>¿Solo quieres ver el menú? Visitar la tienda →</button></p>
    </div>
  </main>
</div>

<style>
  .login-screen {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    min-height: 100vh;
    background: #0a0f1c;
  }

  /* Panel de marca */
  .brand-panel {
    position: relative;
    background-image:
      linear-gradient(160deg, rgba(10, 15, 28, .55) 0%, rgba(10, 15, 28, .92) 70%),
      url('/images/login-bg.jpg');
    background-size: cover;
    background-position: center;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 40px 48px;
  }
  .brand-top {
    display: flex;
    align-items: center;
    gap: 12px;
    color: #fff;
  }
  .brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
    box-shadow: 0 8px 24px rgba(249, 115, 22, .35);
  }
  .brand-name {
    font-weight: 800;
    letter-spacing: .14em;
    font-size: 15px;
  }
  .tagline-mobile { display: none; }
  .brand-bottom { max-width: 460px; }
  .tagline {
    color: #fff;
    font-size: clamp(34px, 4vw, 52px);
    font-weight: 800;
    line-height: 1.05;
    margin: 0 0 14px;
    letter-spacing: -.02em;
  }
  .brand-sub {
    color: rgba(226, 232, 240, .75);
    font-size: 15px;
    line-height: 1.6;
    margin: 0;
  }

  /* Panel del formulario */
  .form-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    background:
      radial-gradient(1200px 600px at 80% -10%, rgba(30, 58, 138, .25), transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(249, 115, 22, .08), transparent 55%),
      #0a0f1c;
  }
  .form-card { width: 100%; max-width: 400px; }
  .login-brand {
    text-align: center;
    margin-bottom: 26px;
  }
  .login-brand :global(img.logo) {
    width: 220px;
    max-width: 80%;
    margin: 0 auto 12px;
    filter: drop-shadow(0 10px 30px rgba(249, 115, 22, .18));
  }
  .login-tagline {
    color: #fb923c;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .14em;
    text-transform: uppercase;
  }
  .form-card h1 {
    color: #fff;
    font-size: 26px;
    font-weight: 800;
    margin: 0 0 6px;
    letter-spacing: -.01em;
  }
  .muted { color: #7c8aa5; font-size: 14px; margin: 0 0 24px; }

  .error-msg {
    background: rgba(239, 68, 68, .12);
    border: 1px solid rgba(239, 68, 68, .4);
    color: #fca5a5;
    font-size: 13px;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 16px;
  }
  .info-msg {
    background: rgba(34, 197, 94, .1);
    border: 1px solid rgba(34, 197, 94, .35);
    color: #86efac;
    font-size: 13px;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 16px;
  }

  .google-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: #fff;
    color: #111827;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 11px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s ease, transform .15s ease;
  }
  .google-btn:hover { background: #f3f4f6; }
  .google-btn:active { transform: scale(.99); }

  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 20px 0;
    color: #5b6b85;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  .divider::before, .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #1e293b;
  }

  label {
    font-size: 13px;
    color: #9fb0c9;
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
  }
  .input-wrap { position: relative; margin-bottom: 16px; }
  .input-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #5b6b85;
    pointer-events: none;
  }
  .input-wrap input {
    width: 100%;
    padding: 12px 42px 12px 42px;
    border-radius: 12px;
    border: 1px solid #243049;
    background: #101828;
    color: #e2e8f0;
    font-size: 14px;
    margin-bottom: 0;
    transition: border-color .15s ease, box-shadow .15s ease;
  }
  .input-wrap input::placeholder { color: #475569; }
  .input-wrap input:focus {
    outline: none;
    border-color: #f97316;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, .15);
  }
  .eye-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: #5b6b85;
    padding: 6px;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }
  .eye-btn:hover { color: #cbd5e1; background: rgba(255,255,255,.05); }

  .forgot-row { text-align: right; margin: -6px 0 18px; }
  .link-btn {
    background: none;
    border: none;
    color: #fb923c;
    font-size: 13px;
    cursor: pointer;
    padding: 0;
  }
  .link-btn:hover { text-decoration: underline; }

  .submit-btn {
    width: 100%;
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
    border: none;
    border-radius: 12px;
    padding: 13px 16px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: filter .15s ease, transform .15s ease;
    margin-top: 4px;
  }
  .submit-btn:hover { filter: brightness(1.08); }
  .submit-btn:active { transform: scale(.99); }
  .submit-btn:disabled { opacity: .55; cursor: not-allowed; }

  .register-note { margin-top: 18px; }
  .register-note .link-btn { font-size: 13px; font-weight: 600; }

  .note {
    margin-top: 28px;
    color: #4b5b75;
    font-size: 12px;
    text-align: center;
    line-height: 1.5;
  }

  /* Móvil: una sola columna, imagen como encabezado */
  @media (max-width: 900px) {
    .login-screen { grid-template-columns: 1fr; }
    .brand-panel {
      min-height: 240px;
      padding: 24px;
      background-image:
        linear-gradient(160deg, rgba(10, 15, 28, .5) 0%, rgba(10, 15, 28, .88) 100%),
        url('/images/login-bg.jpg');
    }
    .brand-bottom { display: none; }
    .tagline-mobile {
      display: block;
      color: #fff;
      font-size: 22px;
      font-weight: 800;
      margin: 12px 0 0;
    }
    .form-panel { padding: 32px 20px 48px; }
  }
</style>
