const DEFAULT_API_VERSION = 'v21.0';
const DEFAULT_TEMPLATE = 'ticket_receipt';

function apiVersion() {
  return process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION;
}

function templateName() {
  return process.env.WHATSAPP_TEMPLATE_NAME || DEFAULT_TEMPLATE;
}

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `256${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) return `256${digits}`;
  return digits;
}

export async function sendTemplateMessage({ to, template = templateName(), params = [], buttonParams = [] }) {
  if (!whatsappConfigured()) {
    console.warn(`[whatsapp] Message to ${to} skipped - set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.`);
    return { ok: false, skipped: true };
  }
  const phone = normalizePhone(to);
  if (!phone) return { ok: false, skipped: true, error: 'missing phone' };

  const url = `https://graph.facebook.com/${apiVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: {
      name: template,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
      components: [],
    },
  };

  if (params.length) {
    payload.template.components.push({
      type: 'body',
      parameters: params.map((value) => ({ type: 'text', text: String(value ?? '') })),
    });
  }
  if (buttonParams.length) {
    payload.template.components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: buttonParams.map((value) => ({ type: 'text', text: String(value ?? '') })),
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { ok: false, error: `HTTP ${response.status} ${detail.slice(0, 300)}` };
  }
  return { ok: true };
}
