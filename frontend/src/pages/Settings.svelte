<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { user } from '../lib/store';
  import DeliveryZones from './DeliveryZones.svelte';

  let s = null;
  let form = {};
  let loading = true;
  let saving = false;
  let error = '';
  let saved = '';

  const FIELDS = [
    { name: 'store_name', label: 'Nombre de la tienda' },
    { name: 'store_tagline', label: 'Eslogan' },
    { name: 'logo_url', label: 'URL del logo' },
    { name: 'phone', label: 'Teléfono' },
    { name: 'whatsapp', label: 'WhatsApp' },
    { name: 'address', label: 'Dirección del local' },
    { name: 'delivery_fee', label: 'Tarifa plana de envío (MXN)', type: 'number' }
  ];
  const CHECKS = [
    { name: 'delivery_enabled', label: 'Entrega a domicilio' },
    { name: 'pickup_enabled', label: 'Recoger en establecimiento' },
    { name: 'cash_enabled', label: 'Pago en efectivo' },
    { name: 'transfer_enabled', label: 'Pago por transferencia' },
    { name: 'mercadopago_enabled', label: 'Mercado Pago (requiere MERCADOPAGO_ACCESS_TOKEN en el servidor)' }
  ];

  onMount(async () => {
    try {
      s = await api('/orders/settings');
      form = { ...s };
    } catch (e) { error = e.message; }
    loading = false;
  });

  async function save() {
    saving = true; error = ''; saved = '';
    try {
      const body = {};
      for (const f of FIELDS) {
        body[f.name] = f.type === 'number' ? (form[f.name] === '' ? 0 : Number(form[f.name])) : (form[f.name] ?? '');
      }
      for (const c of CHECKS) body[c.name] = !!form[c.name];
      // Datos bancarios y texto libre
      for (const k of ['bank_name', 'bank_account_name', 'bank_clabe', 'bank_account_number', 'transfer_instructions']) {
        body[k] = form[k] ?? '';
      }
      s = await api('/orders/settings', { method: 'PUT', body });
      form = { ...s };
      saved = 'Configuración guardada.';
      setTimeout(() => saved = '', 3000);
    } catch (e) { error = e.message; }
    saving = false;
  }
</script>

<h2 class="page-title">Configuración de la tienda</h2>
{#if error}<div class="error-msg card">{error}</div>{/if}
{#if saved}<div class="card" style="border-color:var(--ok);color:var(--ok)">{saved}</div>{/if}

{#if loading}
  <p class="muted">Cargando…</p>
{:else}
  <div class="grid cols-2">
    <div class="card">
      <h3>Datos del negocio</h3>
      {#each FIELDS as f}
        <label for="set-{f.name}">{f.label}</label>
        {#if f.type === 'number'}
          <input id="set-{f.name}" type="number" step="0.01" bind:value={form[f.name]} />
        {:else}
          <input id="set-{f.name}" type="text" bind:value={form[f.name]} />
        {/if}
      {/each}
    </div>

    <div>
      <div class="card">
        <h3>Opciones de entrega y pago</h3>
        {#each CHECKS as c}
          <label style="display:flex;gap:8px;align-items:center;margin-bottom:8px;font-weight:400">
            <input type="checkbox" bind:checked={form[c.name]} style="width:auto;margin:0" /> {c.label}
          </label>
        {/each}
      </div>

      <div class="card">
        <h3>Datos para transferencia</h3>
        <label for="set-bank_name">Banco</label>
        <input id="set-bank_name" bind:value={form.bank_name} />
        <label for="set-bank_account_name">Nombre de la cuenta</label>
        <input id="set-bank_account_name" bind:value={form.bank_account_name} />
        <label for="set-bank_clabe">CLABE</label>
        <input id="set-bank_clabe" bind:value={form.bank_clabe} />
        <label for="set-bank_account_number">Número de cuenta</label>
        <input id="set-bank_account_number" bind:value={form.bank_account_number} />
        <label for="set-transfer_instructions">Instrucciones para el cliente</label>
        <textarea id="set-transfer_instructions" rows="3" bind:value={form.transfer_instructions}></textarea>
      </div>

      <div class="card">
        <h3>Tu cuenta</h3>
        <p><strong>{$user?.name || '—'}</strong></p>
        <p class="muted">{$user?.email}</p>
        <p><span class="badge">{$user?.role || 'cajero'}</span></p>
      </div>
    </div>
  </div>

  <div class="flex" style="margin:12px 0">
    <button on:click={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>
  </div>

  <DeliveryZones />
{/if}
