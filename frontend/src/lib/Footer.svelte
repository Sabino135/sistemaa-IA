<script>
  import Logo from './Logo.svelte';
</script>

<footer class="app-footer">
  <div class="footer-inner">
    <Logo src="/images/logo.png" alt="DAENERYS BURGERS & BURRITOS" width="120" height="48" />
    <div class="footer-text">
      <div class="footer-brand">DAENERYS BURGERS &amp; BURRITOS</div>
      <div class="footer-tag">Sistema de administración y punto de venta</div>
    </div>
  </div>
</footer>

<style>
  .app-footer {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--panel);
    padding: 14px 24px;
  }
  .footer-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .footer-inner :global(img.logo) {
    width: 56px;
    height: 56px;
    object-fit: contain;
  }
  .footer-text { text-align: left; }
  .footer-brand {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .12em;
    color: var(--accent2);
  }
  .footer-tag {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
  @media (max-width: 900px) {
    .app-footer { padding: 12px 16px; }
    .footer-inner { flex-direction: column; gap: 6px; text-align: center; }
    .footer-inner :global(img.logo) { width: 44px; height: 44px; }
    .footer-text { text-align: center; }
  }
</style>
