<script>
  import { user } from '../lib/store';
</script>

<h2 class="page-title">Configuración</h2>

<div class="grid cols-2">
  <div class="card">
    <h3>Negocio</h3>
    <p class="muted">Datos del negocio (nombre comercial, logo, dirección fiscal) estarán disponibles en una próxima versión. Por ahora el nombre se muestra en el panel lateral.</p>
  </div>
  <div class="card">
    <h3>Tu cuenta</h3>
    <p><strong>{$user?.name || '—'}</strong></p>
    <p class="muted">{$user?.email}</p>
    <p><span class="badge">{$user?.role || 'cajero'}</span></p>
    <p class="muted" style="margin-top:12px">Para cambiar tu contraseña usa "Olvidé mi contraseña" en la pantalla de inicio de sesión.</p>
  </div>
</div>
