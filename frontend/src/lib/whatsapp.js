// Utilidades para enlaces de WhatsApp (wa.me)

export function waPhone(raw = '') {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);

  // México: 10 dígitos locales -> +52; 11 dígitos con '1' inicial -> quitar el 1.
  if (d.length === 10) return '52' + d;
  if (d.length === 11 && d.startsWith('1')) return '52' + d.slice(1);
  // +52 1 XX... (13 dígitos) -> +52 XX... (12 dígitos)
  if (d.length === 13 && d.startsWith('521')) return d.slice(0, 2) + d.slice(3);
  return d;
}

export function waLink(phone, message = '') {
  const digits = waPhone(phone);
  if (!digits) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
}

export function orderWhatsAppMessage({ items = [], total = 0, orderNumber = '', delivery = '' } = {}) {
  const lines = (items || []).map(i => {
    const name = i.name || i.product?.name || 'Producto';
    const qty = i.quantity ?? i.qty ?? 1;
    return `- ${qty}x ${name}`;
  });
  const parts = ['Hola, quiero hacer este pedido:'];
  if (orderNumber) parts.push(`Pedido: #${orderNumber}`);
  if (lines.length) parts.push(...lines);
  if (delivery) parts.push(`Entrega: ${delivery}`);
  if (total) parts.push(`Total aprox: $${Number(total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  parts.push('Gracias.');
  return parts.join('\n');
}
