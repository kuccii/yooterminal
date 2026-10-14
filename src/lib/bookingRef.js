const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomString(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return out;
}

export function makeBookingRef() {
  return `BL${randomString(6)}`;
}

export function makeTxRef() {
  return `BL-${Date.now()}-${randomString(5)}`;
}

export function saveTicket(booking) {
  try {
    window.sessionStorage.setItem(`buslink_ticket_${booking.booking_ref}`, JSON.stringify(booking));
  } catch (error) {
    /* storage unavailable — the ticket still shows on this page */
  }
}

export function readTicket(bookingRef) {
  try {
    const raw = window.sessionStorage.getItem(`buslink_ticket_${bookingRef}`);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}