<script>
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  import { completePasswordReset, passwordRecovery, navigate } from '../lib/store';
  import Logo from '../lib/Logo.svelte';

  let password = '';
  let confirm = '';
  let showPassword = false;
  let error = '';
  let loading = false;
  let ready = false;

  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    ready = !!data.session;
  });

  function cancel() {
    passwordRecovery.set(false);
    navigate('/login');
  }

  async function submit(e) {
    e.preventDefault();
    error = '';
    if (password.length < 6) { error = 'La contraseña debe tener al menos 6 caracteres.'; return; }
    if (password !== confirm) { error = 'Las contraseñas no coinciden.'; return; }
    loading = true;
    try {
      await completePasswordReset(password);
    } catch (err) {
      error = err.message || 'No se pudo actualizar la contraseña.';
      loading = false;
    }
  }
</script>

<div class="reset-screen">
  <div class="reset-card card">
    <div class="reset-brand">
      <Logo src="/images/logo.png" alt="DAENERYS BURGERS & BURRITOS" />
      <div class="reset-tagline">BURGER &amp; BURRITOS | Punto de Venta y Administración</div>
    </div>
    <h1 class="page-title" style="margin:0 0 6px">Nueva contraseña</h1>
    <p class="muted" style="margin:0 0 20px">Elige una nueva contraseña para tu cuenta.</p>

    {#if error}<div class="error-msg">{error}</div>{/if}

    {#if ready}
      <form on:submit={submit}>
        <label for="newpass">Nueva contraseña</label>
        <div class="input-wrap">
          <input id="newpass" type={showPassword ? 'text' : 'password'} value={password} on:input={(e) => password = e.target.value} placeholder="••••••••" required minlength="6" autocomplete="new-password" />
          <button type="button" class="eye-btn" on:click={() => showPassword = !showPassword} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            {#if showPassword}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            {/if}
          </button>
        </div>

        <label for="confirmpass">Confirmar contraseña</label>
        <input id="confirmpass" type={showPassword ? 'text' : 'password'} value={confirm} on:input={(e) => confirm = e.target.value} placeholder="••••••••" required minlength="6" autocomplete="new-password" />

        <button class="submit-btn" type="submit" disabled={loading} style="width:100%">
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    {:else}
      <p class="muted">Este enlace no es válido o ya expiró. Solicita uno nuevo desde la pantalla de inicio de sesión.</p>
    {/if}

    <p class="note"><button type="button" class="link-btn" on:click={cancel}>← Volver a iniciar sesión</button></p>
  </div>
</div>

<style>
  .reset-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
    background:
      radial-gradient(1200px 600px at 80% -10%, rgba(30, 58, 138, .25), transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(249, 115, 22, .08), transparent 55%),
      #0a0f1c;
  }
  .reset-card {
    width: 100%;
    max-width: 420px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 28px;
  }
  .reset-brand { text-align: center; margin-bottom: 22px; }
  .reset-brand :global(img.logo) { width: 200px; max-width: 80%; margin: 0 auto 10px; }
  .reset-tagline {
    color: #fb923c;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .14em;
    text-transform: uppercase;
  }
  .page-title { color: #fff; font-size: 24px; font-weight: 800; }
  .muted { color: #7c8aa5; font-size: 14px; }
  .error-msg {
    background: rgba(239, 68, 68, .12);
    border: 1px solid rgba(239, 68, 68, .4);
    color: #fca5a5;
    font-size: 13px;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 16px;
  }
  .input-wrap { position: relative; margin-bottom: 6px; }
  .input-wrap input {
    width: 100%;
    padding: 12px 42px 12px 14px;
    border-radius: 12px;
    border: 1px solid #243049;
    background: #101828;
    color: #e2e8f0;
    font-size: 14px;
  }
  .input-wrap input:focus { outline: none; border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,.15); }
  input:not(.input-wrap input) {
    width: 100%;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid #243049;
    background: #101828;
    color: #e2e8f0;
    font-size: 14px;
    margin-bottom: 16px;
  }
  input::placeholder { color: #475569; }
  label { color: #9fb0c9; font-size: 13px; display: block; margin-bottom: 6px; font-weight: 500; }
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
  .eye-btn:hover { color: #cbd5e1; }
  .submit-btn {
    background: linear-gradient(135deg, #f97316, #ea580c);
    color: #fff;
    border: none;
    border-radius: 12px;
    padding: 13px 16px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 8px;
  }
  .submit-btn:disabled { opacity: .55; cursor: not-allowed; }
  .note { margin-top: 20px; text-align: center; }
  .link-btn {
    background: none;
    border: none;
    color: #fb923c;
    font-size: 13px;
    cursor: pointer;
    padding: 0;
  }
  .link-btn:hover { text-decoration: underline; }
</style>
