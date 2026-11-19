import { writable, get } from 'svelte/store';
import { api } from './api';

// Configuración pública de la tienda online (GET /api/store/settings)
export const storeSettings = writable(null);

export async function loadStoreSettings(force = false) {
  const current = get(storeSettings);
  if (current && !force) return current;
  const settings = await api('/store/settings');
  storeSettings.set(settings);
  return settings;
}
