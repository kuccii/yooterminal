import { sendMailSafe } from './mailer.js';

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

function formatMoney(amount, currency) {
  const value = Number(amount) || 0;
  return `${currency || 'UGX'} ${value.toLocaleString('en-US')}`;
}

function formatTravelDate(travelDate) {
  const date = new Date(`${travelDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(travelDate || '');
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function seatLabels(booking) {
  const seats = parseJsonArray(booking.seats);
  return seats.map(String).join(', ') || '—';
}

function passengerNames(booking) {
  return parseJsonArray(booking.passengers)
    .map((passenger) => passenger?.name)
    .filter(Boolean)
    .join(', ') || '—';
}

function tripDetailRows(booking) {
  return [
    ['Route', `${booking.origin_city || '—'} → ${booking.destination_city || '—'}`],
    ['Operator', booking.operator_name || '—'],
    ['Date', formatTravelDate(booking.travel_date)],
    ['Departure', booking.departure_time || '—'],
    ['Seats', seatLabels(booking)],
    ['Passengers', passengerNames(booking)],
  ];
}

function wrapHtml(title, intro, rows, footer) {
  const bodyRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;">${label}</td>` +
        `<td style="padding:6px 0;font-weight:600;">${value}</td></tr>`,
    )
    .join('');
  return (
    '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;margin:0;">' +
    `<div style="max-width:520px;margin:0 auto;padding:24px;">` +
    `<h2 style="margin:0 0 8px;font-size:20px;">${title}</h2>` +
    `<p style="margin:0 0 16px;color:#334155;">${intro}</p>` +
    `<table style="border-collapse:collapse;margin-bottom:16px;">${bodyRows}</table>` +
    `<p style="margin:0;color:#64748b;font-size:13px;">${footer}</p>` +
    `</div></body></html>`
  );
}

export function ticketUrl(bookingRef) {
  return `${CLIENT_ORIGIN}/booking/${bookingRef}`;
}

export function buildBookingConfirmation(booking) {
  const rows = [
    ...tripDetailRows(booking),
    ['Paid', formatMoney(booking.amount, booking.currency)],
    ['Booking ref', booking.booking_ref],
  ];
  return {
    to: booking.contact_email,
    subject: `Booking confirmed — ${booking.booking_ref}`,
    text: [
      `Your booking ${booking.booking_ref} is confirmed.`,
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      `View your ticket: ${ticketUrl(booking.booking_ref)}`,
    ].join('\n'),
    html: wrapHtml(
      'Booking confirmed',
      `Your booking <strong>${booking.booking_ref}</strong> is confirmed. Have your ticket ready at boarding.`,
      rows,
      `View your ticket: <a href="${ticketUrl(booking.booking_ref)}">${ticketUrl(booking.booking_ref)}</a>`,
    ),
  };
}

export function buildTicketMessage(booking) {
  return [
    `Booking ${booking.booking_ref} confirmed`,
    `${booking.origin_city || '—'} → ${booking.destination_city || '—'}`,
    `${booking.operator_name || '—'} · ${formatTravelDate(booking.travel_date)} · ${booking.departure_time || '—'}`,
    `Seats ${seatLabels(booking)}`,
    `Paid ${formatMoney(booking.amount, booking.currency)}`,
    `Ticket ${ticketUrl(booking.booking_ref)}`,
  ].join('\n');
}

export function buildTicketTemplateParams(booking) {
  return [
    booking.contact_name || passengerNames(booking),
    booking.booking_ref,
    `${booking.origin_city || '—'} → ${booking.destination_city || '—'}`,
    `${formatTravelDate(booking.travel_date)} ${booking.departure_time || ''}`.trim(),
    seatLabels(booking),
    formatMoney(booking.amount, booking.currency),
  ];
}

export async function sendBookingConfirmation(booking) {
  const message = buildBookingConfirmation(booking);
  return sendMailSafe(message);
}

export function buildCancellation(booking) {
  const refundCopy = {
    refunded: 'Your refund has been issued to the original payment method.',
    refund_pending: 'Your refund has been requested and should reach your account within a few days.',
    not_refunded: 'No refund was due for this booking.',
  };
  const refundNote = refundCopy[booking.refund_status] || 'No refund was due for this booking.';
  const rows = [
    ...tripDetailRows(booking),
    ['Booking ref', booking.booking_ref],
    ['Refund', refundNote],
  ];
  return {
    to: booking.contact_email,
    subject: `Booking cancelled — ${booking.booking_ref}`,
    text: [
      `Your booking ${booking.booking_ref} has been cancelled.`,
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
    ].join('\n'),
    html: wrapHtml(
      'Booking cancelled',
      `Your booking <strong>${booking.booking_ref}</strong> has been cancelled.`,
      rows,
      'Need help? Reply to this email or contact the operator directly.',
    ),
  };
}

export async function sendCancellation(booking) {
  return sendMailSafe(buildCancellation(booking));
}

export function buildRefundConfirmation(booking) {
  const rows = [
    ...tripDetailRows(booking),
    ['Booking ref', booking.booking_ref],
    ['Refunded', formatMoney(booking.amount, booking.currency)],
  ];
  return {
    to: booking.contact_email,
    subject: `Refund processed — ${booking.booking_ref}`,
    text: [
      `Your refund for booking ${booking.booking_ref} has been processed.`,
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'The funds should appear on your original payment method shortly.',
    ].join('\n'),
    html: wrapHtml(
      'Refund processed',
      `Your refund for booking <strong>${booking.booking_ref}</strong> has been processed.`,
      rows,
      'The funds should appear on your original payment method shortly.',
    ),
  };
}

export async function sendRefundConfirmation(booking) {
  return sendMailSafe(buildRefundConfirmation(booking));
}

export function buildDepartureReminder(booking) {
  const rows = [
    ...tripDetailRows(booking),
    ['Booking ref', booking.booking_ref],
  ];
  return {
    to: booking.contact_email,
    subject: `Departure tomorrow — ${booking.origin_city} → ${booking.destination_city}`,
    text: [
      `Reminder: your bus leaves tomorrow.`,
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Please arrive at the station at least 30 minutes before departure.',
    ].join('\n'),
    html: wrapHtml(
      'Departure tomorrow',
      'Your bus leaves tomorrow. Please arrive at the station at least 30 minutes before departure.',
      rows,
      `Ticket details: <a href="${ticketUrl(booking.booking_ref)}">${ticketUrl(booking.booking_ref)}</a>`,
    ),
  };
}

export async function sendDepartureReminder(booking) {
  return sendMailSafe(buildDepartureReminder(booking));
}
