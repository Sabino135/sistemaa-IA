<script>
  import { navigate } from '../../lib/store';

  let id = '';
  let token = '';
  let error = '';

  function go() {
    error = '';
    const cleanId = id.trim();
    const cleanToken = token.trim();
    if (!/^[0-9a-f-]{36}$/i.test(cleanId)) {
      error = 'Ingresa el ID completo del pedido (el enlace de confirmación lo contiene).';
      return;
    }
    navigate(`/pedido/${cleanId}${cleanToken ? `?token=${cleanToken}` : ''}`);
  }
</script>

<div class="card" style="max-width:520px;margin:40px auto">
  <h2>Rastrear mi pedido</h2>
  <p class="muted">Usa el ID del pedido y el código de seguimiento que recibiste al confirmar tu compra.</p>
  {#if error}<div class="error-msg">{error}</div>{/if}
  <label for="lk-id">ID del pedido</label>
  <input id="lk-id" bind:value={id} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
  <label for="lk-token">Código de seguimiento</label>
  <input id="lk-token" bind:value={token} placeholder="Token de invitado" />
  <button style="width:100%;margin-top:10px" on:click={go}>Buscar pedido</button>
</div>
