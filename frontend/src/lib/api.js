import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export async function api(path, { method = 'GET', body } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data2 = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      await supabase.auth.signOut();
      window.location.hash = '#/login';
    }
    throw new Error(data2.error || `Error ${res.status}`);
  }
  return data2;
}

export const fmtMoney = n => n == null ? '—' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = d => d ? new Date(d).toLocaleString('es-MX') : '—';
