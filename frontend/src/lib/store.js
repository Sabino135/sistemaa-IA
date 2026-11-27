import { writable, get } from 'svelte/store';
import { supabase } from './supabase';
import { api } from './api';

export const user = writable(null);
export const sessionReady = writable(false);
export const passwordRecovery = writable(false);
export const route = writable(window.location.hash.replace(/^#/, '') || '/');

let lastPasswordResetAt = 0;
const PASSWORD_RESET_COOLDOWN_MS = 60_000;

window.addEventListener('hashchange', () => {
  route.set(window.location.hash.replace(/^#/, '') || '/');
});

export function navigate(path) {
  window.location.hash = '#' + path;
}

let profileRequest = null;
let lastProfileError = null;

// Dedup: SIGNED_IN y loginWithEmail pueden disparar fetchProfile a la vez;
// sin esto se generan llamadas duplicadas a /api/auth/me.
async function fetchProfile() {
  if (!profileRequest) {
    profileRequest = (async () => {
      try {
        const me = await api('/auth/me');
        user.set(me);
        lastProfileError = null;
        return me;
      } catch (err) {
        user.set(null);
        lastProfileError = err;
        return null;
      } finally {
        profileRequest = null;
      }
    })();
  }
  return profileRequest;
}

export async function initAuth() {
  // Espera a que supabase-js procese el redirect de OAuth (PKCE)
  const { data } = await supabase.auth.getSession();
  if (data.session) await fetchProfile();
  sessionReady.set(true);
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (session) await fetchProfile();
    } else if (event === 'SIGNED_OUT') {
      user.set(null);
      passwordRecovery.set(false);
    } else if (event === 'PASSWORD_RECOVERY') {
      passwordRecovery.set(true);
    }
    callback?.(event, session);
  });
}

// --- Acciones de autenticación ---

export async function loginWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/'
    }
  });
  if (error) throw error;
}

export async function loginWithEmail(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const me = await fetchProfile();
  if (!me) {
    // Credenciales válidas en Supabase pero el backend no pudo verificar
    // el token (p. ej. variables de entorno incorrectas en Vercel).
    // Mostramos el error real en lugar de rebotar en silencio al login.
    if (lastProfileError?.status === 401) {
      await supabase.auth.signOut();
      throw new Error('Sesión iniciada pero el servidor no pudo verificarla. Revisa la configuración del backend (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    }
    throw lastProfileError || new Error('No se pudo conectar con el servidor.');
  }
  // Un cliente de la tienda nunca entra al panel: va directo a la tienda.
  navigate(me.role === 'cliente' ? '/tienda' : '/dashboard');
}

export async function resetPassword(email) {
  const now = Date.now();
  const remainingMs = PASSWORD_RESET_COOLDOWN_MS - (now - lastPasswordResetAt);
  if (remainingMs > 0) {
    throw new Error(`Por seguridad, espera ${Math.ceil(remainingMs / 1000)} segundos antes de solicitar otro enlace.`);
  }
  lastPasswordResetAt = now;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/'
  });
  if (error) {
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      throw new Error('Supabase limitó el envío de correos de recuperación. Espera al menos 60 segundos o configura un SMTP propio en Supabase.');
    }
    throw error;
  }
}

export async function completePasswordReset(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  passwordRecovery.set(false);
  await fetchProfile();
  navigate('/dashboard');
}

export async function registerWithEmail(name, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } }
  });
  if (error) throw error;
  // Si la confirmación de email está desactivada, hay sesión inmediata
  if (data.session) {
    await fetchProfile();
    const me = get(user);
    navigate(me?.role === 'cliente' ? '/tienda' : '/dashboard');
  }
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
  user.set(null);
  // Toda sesión cerrada vuelve a la portada de acceso (/); nadie entra
  // automáticamente a la tienda ni al panel tras cerrar sesión.
  navigate('/');
}
