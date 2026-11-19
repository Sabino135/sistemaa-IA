/**
 * Integración con Mercado Pago (Checkout Pro).
 * Solo backend: el Access Token vive en variables de entorno y nunca
 * se expone al frontend. Si no hay token configurado, las funciones
 * lanzan un error claro y las rutas responden "no disponible".
 *
 * Variables de entorno:
 *   MERCADOPAGO_ACCESS_TOKEN   (obligatoria para cobrar)
 *   MERCADOPAGO_WEBHOOK_SECRET (opcional; valida la firma del webhook)
 *   PUBLIC_BASE_URL            (URL pública del sitio, para back_urls/notification_url)
 */
const MP_API = 'https://api.mercadopago.com';

function accessToken() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN || null;
}

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function isConfigured() {
  return Boolean(accessToken());
}

/**
 * Crea una preferencia de pago (Checkout Pro) para un pedido.
 * order: fila de `orders`; items: filas de `order_items`.
 * Devuelve { id, init_point }.
 */
async function createPreference(order, items) {
  const token = accessToken();
  if (!token) throw new Error('Mercado Pago no configurado (falta MERCADOPAGO_ACCESS_TOKEN)');

  const base = baseUrl();
  const body = {
    external_reference: order.id,
    items: items.map(i => ({
      title: i.name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      currency_id: 'MXN'
    })),
    // El envío se cobra como un item adicional cuando aplica.
    ...(Number(order.delivery_fee) > 0
      ? {
          shipments: {
            cost: Number(order.delivery_fee),
            mode: 'not_specified'
          }
        }
      : {}),
    payer: {
      name: order.customer_name,
      email: order.customer_email || undefined,
      phone: order.customer_phone ? { number: String(order.customer_phone) } : undefined
    },
    back_urls: base
      ? {
          success: `${base}/#/pedido/${order.id}?pago=exito`,
          failure: `${base}/#/pedido/${order.id}?pago=fallo`,
          pending: `${base}/#/pedido/${order.id}?pago=pendiente`
        }
      : undefined,
    auto_return: base ? 'approved' : undefined,
    notification_url: base ? `${base}/api/store/webhooks/mercadopago` : undefined,
    statement_descriptor: 'DAENERYS',
    metadata: { order_id: order.id }
  };

  const resp = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Mercado Pago ${resp.status}: ${data.message || JSON.stringify(data)}`);
  }
  return { id: data.id, init_point: data.init_point || data.sandbox_init_point };
}

/**
 * Consulta el estado de un pago por su id en Mercado Pago.
 * Devuelve el objeto payment (status, external_reference, etc.).
 */
async function getPayment(paymentId) {
  const token = accessToken();
  if (!token) throw new Error('Mercado Pago no configurado');
  const resp = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Mercado Pago ${resp.status}`);
  return data;
}

/**
 * Valida (de forma best-effort) la firma `x-signature` del webhook.
 * Mercado Pago firma con HMAC-SHA256 usando el secreto del webhook.
 * Si no hay secreto configurado, no se puede validar y se devuelve true
 * (el webhook igualmente reconsulta el pago contra la API antes de confiar).
 */
function verifyWebhookSignature(req) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;
  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  if (!signature || !requestId) return false;

  const parts = Object.fromEntries(
    String(signature).split(',').map(p => p.split('=').map(s => s.trim()))
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const dataId = (req.query['data.id'] || req.body?.data?.id || '').toString().toLowerCase();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return hmac === v1;
}

const crypto = require('crypto');

module.exports = { createPreference, getPayment, verifyWebhookSignature, isConfigured };
