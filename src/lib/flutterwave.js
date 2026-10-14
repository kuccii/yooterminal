export function looksConfigured(publicKey) {
  const key = String(publicKey || '');
  return /^FLWPUBK(-TEST)?-/i.test(key) && !/REPLACE/i.test(key);
}

export function payWithFlutterwave({ publicKey, txRef, amount, currency, customer, description, onSuccess, onClose }) {
  if (!looksConfigured(publicKey) || typeof window === 'undefined' || typeof window.FlutterwaveCheckout !== 'function') {
    return false;
  }
  window.FlutterwaveCheckout({
    public_key: publicKey,
    tx_ref: txRef,
    amount: Number(amount),
    currency,
    payment_options: 'card,mobilemoneyuganda,mobilemoneyrwanda',
    customer,
    customizations: {
      title: 'YooTerminal',
      description,
    },
    callback: onSuccess,
    onclose: onClose,
  });
  return true;
}
