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
    { name: 'banner_url', label: 'URL del banner promocional' },
    { name: 'business_description', label: 'Descripción del negocio', type: 'textarea' },
    { name: 'business_hours', label: 'Horarios de atención', placeholder: 'Lun-Dom 11:00 a 22:00' },
    { name: 'business_email', label: 'Correo electrónico', type: 'email' },
    { name: 'phone', label: 'Teléfono' },
    { name: 'whatsapp', label: 'WhatsApp' },
    { name: 'address', label: 'Dirección del local' },
    { name: 'social_facebook', label: 'Facebook (URL)' },
    { name: 'social_instagram', label: 'Instagram (URL)' },
    { name: 'social_tiktok', label: 'TikTok (URL)' },
    { name: 'announcement', label: 'Aviso para clientes (se muestra en la tienda)', type: 'textarea', placeholder: 'Ej. Cerramos el 25 de diciembre' },
    { name: 'delivery_fee', label: 'Tarifa plana de envío (MXN)', type: 'number' }
  ];
  const CHECKS = [
    { name: 'delivery_enabled', label: 'Entrega a domicilio' },
    { name: 'pickup_enabled', label: 'Recoger en establecimiento' },
    { name: 'cash_enabled', label: 'Pago en efectivo' },
    { name: 'transfer_enabled', label: 'Pago por transferencia' },
    { name: 'mercadopago_enabled', label: 'Mercado Pago (requiere MERCADOPAGO_ACCESS_TOKEN en el servidor)' }
  ];

  // ---- Cuentas de cobro (payment_methods) ----
  let payMethods = [];
  let pmLoading = true;
  let pmError = '';
  let pmForm = null; // {} nuevo | objeto editando
  let pmSaving = false;

  const PM_FIELDS = [
    { name: 'name', label: 'Nombre del método *', required: true, placeholder: 'Ej. BBVA · Cuenta principal' },
    { name: 'kind', label: 'Tipo', type: 'select', options: [['transfer', 'Transferencia'], ['card', 'Tarjeta'], ['other', 'Otro']] },
    { name: 'bank_name', label: 'Banco' },
    { name: 'holder_name', label: 'Nombre del titular' },
    { name: 'clabe', label: 'CLABE interbancaria' },
    { name: 'account_number', label: 'Número de cuenta' },
    { name: 'card_number', label: 'Número de tarjeta (si aplica)' },
    { name: 'instructions', label: 'Instrucciones para el cliente', type: 'textarea' },
    { name: 'image_url', label: 'URL de imagen / comprobante de referencia' },
    { name: 'sort_order', label: 'Orden', type: 'number' }
  ];

  function pmBlank() {
    return { name: '', kind: 'transfer', bank_name: '', holder_name: '', clabe: '', account_number: '', card_number: '', instructions: '', image_url: '', active: true, sort_order: 0 };
  }

  async function loadPayMethods() {
    pmLoading = true; pmError = '';
    try { payMethods = await api('/payment-methods'); }
    catch (e) { pmError = e.message; }
    pmLoading = false;
  }

  function pmNew() { pmForm = pmBlank(); }
  function pmEdit(m) { pmForm = { ...m }; }

  async function pmSave() {
    pmSaving = true; pmError = '';
    try {
      const body = {};
      for (const f of PM_FIELDS) {
        let v = pmForm[f.name];
        if (f.type === 'number') v = v === '' ? 0 : Number(v);
        if (v !== undefined) body[f.name] = v;
      }
      body.active = pmForm.active !== false;
      if (pmForm.id) await api(`/payment-methods/${pmForm.id}`, { method: 'PUT', body });
      else await api('/payment-methods', { method: 'POST', body });
      pmForm = null;
      await loadPayMethods();
    } catch (e) { pmError = e.message; }
    pmSaving = false;
  }

  async function pmDelete(m) {
    if (!confirm(`¿Desactivar "${m.name}"? Dejará de mostrarse a los clientes.`)) return;
    try { await api(`/payment-methods/${m.id}`, { method: 'DELETE' }); await loadPayMethods(); }
    catch (e) { pmError = e.message; }
  }

  onMount(async () => {
    try {
      s = await api('/orders/settings');
      form = { ...s };
    } catch (e) { error = e.message; }
    loading = false;
    loadPayMethods();
  });

  async function save() {
    saving = true; error = ''; saved = '';
    try {
      const body = {};
      for (const f of FIELDS) {
        body[f.name] = f.type === 'number' ? (form[f.name] === '' ? 0 : Number(form[f.name])) : (form[f.name] ?? '');
      }
      for (const c of CHECKS) body[c.name] = !!form[c.name];
      // Datos bancarios legacy (respaldo si no hay payment_methods)
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

<h2 class="page-title">Configuración</h2>
{#if error}<div class="error-msg card">{error}</div>{/if}
{#if saved}<div class="card" style="border-color:var(--ok);color:var(--ok)">{saved}</div>{/if}

{#if loading}
  <p class="muted">Cargando…</p>
{:else}
  <div class="grid cols-2">
    <div class="card">
      <h3>Información del negocio</h3>
      {#each FIELDS as f}
        <label for="set-{f.name}">{f.label}</label>
        {#if f.type === 'number'}
          <input id="set-{f.name}" type="number" step="0.01" bind:value={form[f.name]} />
        {:else if f.type === 'textarea'}
          <textarea id="set-{f.name}" rows="2" placeholder={f.placeholder || ''} bind:value={form[f.name]}></textarea>
        {:else if f.type === 'email'}
          <input id="set-{f.name}" type="email" bind:value={form[f.name]} />
        {:else}
          <input id="set-{f.name}" type="text" placeholder={f.placeholder || ''} bind:value={form[f.name]} />
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
        <h3>Datos para transferencia (respaldo)</h3>
        <p class="muted" style="font-size:12px">Se usan solo si no hay cuentas registradas en "Cuentas de cobro".</p>
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

  <!-- Cuentas de cobro: se guardan de inmediato, no con el botón general -->
  <div class="card">
    <div class="flex" style="justify-content:space-between;align-items:center">
      <h3 style="margin:0">Cuentas de cobro (transferencias / tarjetas)</h3>
      <button class="secondary" style="padding:6px 12px;font-size:13px" on:click={pmNew}>+ Agregar cuenta</button>
    </div>
    <p class="muted" style="font-size:12px">Se muestran al cliente solo cuando el método de pago correspondiente está habilitado. No ingreses CVV ni contraseñas bancarias.</p>
    {#if pmError}<div class="error-msg">{pmError}</div>{/if}

    {#if pmForm}
      <div class="card" style="background:var(--panel2);margin-top:10px">
        <h4>{pmForm.id ? 'Editar cuenta' : 'Nueva cuenta'}</h4>
        <div class="grid cols-2">
          {#each PM_FIELDS as f}
            <div>
              <label for="pm-{f.name}">{f.label}</label>
              {#if f.type === 'select'}
                <select id="pm-{f.name}" bind:value={pmForm[f.name]}>
                  {#each f.options as [v, l]}<option value={v}>{l}</option>{/each}
                </select>
              {:else if f.type === 'textarea'}
                <textarea id="pm-{f.name}" rows="2" bind:value={pmForm[f.name]}></textarea>
              {:else if f.type === 'number'}
                <input id="pm-{f.name}" type="number" bind:value={pmForm[f.name]} />
              {:else}
                <input id="pm-{f.name}" type="text" placeholder={f.placeholder || ''} bind:value={pmForm[f.name]} />
              {/if}
            </div>
          {/each}
        </div>
        <label style="display:flex;gap:8px;align-items:center;font-weight:400">
          <input type="checkbox" bind:checked={pmForm.active} style="width:auto;margin:0" /> Activa (visible para clientes)
        </label>
        <div class="flex">
          <button on:click={pmSave} disabled={pmSaving}>{pmSaving ? 'Guardando…' : 'Guardar cuenta'}</button>
          <button class="secondary" on:click={() => pmForm = null}>Cancelar</button>
        </div>
      </div>
    {/if}

    {#if pmLoading}<p class="muted">Cargando…</p>
    {:else if payMethods.length === 0}<p class="muted">Sin cuentas registradas.</p>
    {:else}
      <table style="margin-top:10px">
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Banco</th><th>CLABE / Cuenta</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {#each payMethods as m}
            <tr>
              <td><strong>{m.name}</strong>{#if m.holder_name}<br /><span class="muted" style="font-size:12px">{m.holder_name}</span>{/if}</td>
              <td>{m.kind === 'transfer' ? 'Transferencia' : m.kind === 'card' ? 'Tarjeta' : 'Otro'}</td>
              <td>{m.bank_name || '—'}</td>
              <td>{m.clabe || m.account_number || m.card_number || '—'}</td>
              <td><span class="badge {m.active ? 'ok' : 'warn'}">{m.active ? 'Activa' : 'Inactiva'}</span></td>
              <td style="white-space:nowrap">
                <button class="secondary" style="padding:4px 10px;font-size:12px" on:click={() => pmEdit(m)}>Editar</button>
                {#if m.active}
                  <button class="danger" style="padding:4px 10px;font-size:12px;margin-left:6px" on:click={() => pmDelete(m)}>✕</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <DeliveryZones />
{/if}
