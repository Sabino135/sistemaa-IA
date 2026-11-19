const { supabase } = require('../db/supabase');
const express = require('express');
const { verifyWebhookSignature, getPayment } = require('../payments/mercadopago');

const router = express.Router();

/**
 * POST /api/store/webhooks/mercadopago
 * Mercado Pago notifica cambios de pago. NUNCA marcamos un pedido como
 * pagado por el simple regreso del cliente a la página de éxito: siempre
 * reconsultamos el pago contra la API de Mercado Pago antes de confiar.
 */
router.post('/mercadopago', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req)) {
      console.warn('[mp webhook] firma inválida');
      return res.status(401).json({ error: 'Firma inválida' });
    }

    // El id del pago puede venir como query (?data.id=) o en el body.
    const paymentId = req.query['data.id'] || req.body?.data?.id || req.body?.id;
    const type = req.query.type || req.body?.type || req.body?.action;
    if (!paymentId || (type && !String(type).includes('payment'))) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // Reconsulta del pago contra Mercado Pago (fuente de verdad).
    const payment = await getPayment(paymentId);
    const orderId = payment.external_reference || payment.metadata?.order_id;
    if (!orderId) return res.status(200).json({ ok: true, ignored: true });

    const statusMap = {
      approved: 'paid',
      rejected: 'rejected',
      cancelled: 'cancelled',
      refunded: 'refunded',
      charged_back: 'refunded'
    };
    const paymentStatus = statusMap[payment.status] || 'pending';

    const { data: order } = await supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
    if (!order) return res.status(200).json({ ok: true, ignored: true });

    await supabase.from('orders').update({
      payment_status: paymentStatus,
      payment_reference: String(payment.id),
      updated_at: new Date().toISOString()
    }).eq('id', orderId);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[mp webhook]', err);
    // 200 para que Mercado Pago no reintente indefinidamente ante errores
    // de nuestro lado; el estado se reconcilia en la próxima notificación.
    res.status(200).json({ ok: false });
  }
});

module.exports = router;
