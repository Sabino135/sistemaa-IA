import { writable } from 'svelte/store';
import { supabase } from './supabase';
import { api } from './api';

export const user = writable(null);
export const sessionReady = writable(false);
export const route = writable(window.location.hash.replace(/^#/, '') || '/');

window.addEventListener('hashchange', () => {
  route.set(window.location.hash.replace(/^#/, '') || '/');
});

export function navigate(path) {
  window.location.hash = '#' + path;
}

async function fetchProfile() {
  try {
    const me = await api('/auth/me');
    user.set(me);
    return me;
  } catch {
    user.set(null);
    return null;
  }
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
  await fetchProfile();
  navigate('/dashboard');
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/'
  });
  if (error) throw error;
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
    navigate('/dashboard');
  }
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
  user.set(null);
  navigate('/login');
}
