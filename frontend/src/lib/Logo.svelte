<script>
  export let src = '/images/logo.png';
  export let alt = 'DAENERYS BURGERS & BURRITOS';
  export let width = null;
  export let height = null;
</script>

<img
  class="logo"
  {src}
  {alt}
  {width}
  {height}
  loading="lazy"
  decoding="async"
/>

<style>
  .logo {
    display: block;
    object-fit: contain;
    max-width: 100%;
    height: auto;
  }
</style>
