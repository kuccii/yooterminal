// Paste your BusLink Flutterwave public key here (Dashboard → Settings → API keys).
// The public key is designed to be used in the browser; never put your secret key in this file.
export const FLUTTERWAVE_PUBLIC_KEY =
  (import.meta.env && import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY) ||
  'FLWPUBK-REPLACE-WITH-YOUR-PUBLIC-KEY';

export function isPaymentConfigured() {
  return /^FLWPUBK(-TEST)?-/i.test(FLUTTERWAVE_PUBLIC_KEY) && !/REPLACE/i.test(FLUTTERWAVE_PUBLIC_KEY);
}

export function payWithFlutterwave({ txRef, amount, currency, customer, description, onSuccess, onClose }) {
  if (!isPaymentConfigured() || typeof window === 'undefined' || typeof window.FlutterwaveCheckout !== 'function') {
    return false;
  }
  window.FlutterwaveCheckout({
    public_key: FLUTTERWAVE_PUBLIC_KEY,
    tx_ref: txRef,
    amount: Number(amount),
    currency,
    payment_options: 'card,mobilemoneyuganda,mobilemoneyrwanda',
    customer,
    customizations: {
      title: 'BusLink',
      description,
    },
    callback: onSuccess,
    onclose: onClose,
  });
  return true;
}