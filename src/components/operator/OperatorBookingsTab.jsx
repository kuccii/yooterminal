import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Mail, MessageCircle, Search, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import OperatorManifest from '@/components/operator/OperatorManifest';
import { formatMoney, todayISO } from '@/lib/format';

const FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past trips' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
];

export function waNumber(phone, country) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const cc = (country || '').includes('Rwanda') ? '250' : '256';
  if (digits.startsWith('0')) return cc + digits.slice(1);
  if (digits.startsWith('256') || digits.startsWith('250')) return digits;
  return digits;
}

export default function OperatorBookingsTab({ operator }) {
  const [mode, setMode] = useState('list');
  const [filter, setFilter] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [searched, setSearched] = useState('');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = todayISO();

  const load = useCallback(async () => {
    setLoading(true);
    let query = { operator_slug: operator.slug };
    if (filter === 'upcoming') query = { ...query, travel_date: { $gte: today }, status: { $ne: 'cancelled' } };
    if (filter === 'past') query = { ...query, travel_date: { $lt: today }, status: { $ne: 'cancelled' } };
    if (filter === 'cancelled') query = { ...query, status: 'cancelled' };
    if (searched) query = { ...query, booking_ref: { $regex: searched.toUpperCase(), $options: 'i' } };
    const page = await db.entities.Booking.filter(query, { sort: filter === 'past' ? '-travel_date' : 'travel_date', limit: 60 });
    setBookings(page.items || []);
    setLoading(false);
  }, [operator.slug, filter, searched, today]);

  useEffect(() => {
    load();
  }, [load]);

  const checkIn = async (booking) => {
    await db.entities.Booking.update(booking.id, {
      validated: true,
      validated_at: new Date().toISOString(),
      validated_by: operator.name,
    });
    await load();
  };

  const whatsappLink = (booking) => {
    const text = encodeURIComponent(
      `Hello ${booking.contact_name}, your ticket ${booking.booking_ref} with ${operator.name} is confirmed: ` +
        `${booking.origin_city} → ${booking.destination_city} on ${booking.travel_date} at ${booking.departure_time}, ` +
        `seats ${(booking.seats || []).join(', ')}. Paid ${formatMoney(booking.amount, booking.currency)}.`
    );
    return `https://wa.me/${waNumber(booking.contact_phone, operator.country)}?text=${text}`;
  };

  const mailtoLink = (booking) => {
    const subject = encodeURIComponent(`Your ticket ${booking.booking_ref} — ${operator.name}`);
    const body = encodeURIComponent(
      `Hello ${booking.contact_name},\n\nYour ticket ${booking.booking_ref} is confirmed:\n` +
        `${booking.origin_city} → ${booking.destination_city} on ${booking.travel_date} at ${booking.departure_time}\n` +
        `Seats: ${(booking.seats || []).join(', ')}\nPassengers: ${(booking.passengers || []).map((p) => p.name).join(', ')}\n` +
        `Paid ${formatMoney(booking.amount, booking.currency)}\n\nSee you on board!\n${operator.name}`
    );
    return `mailto:${booking.contact_email}?subject=${subject}&body=${body}`;
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Users className="h-4 w-4 text-primary" /> Booked tickets
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'list'
              ? 'Every ticket sold on your departures. Check passengers in or message them on WhatsApp / email.'
              : 'Per-departure passenger roster for trip day. Print it or export it for the crew.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {['list', 'manifest'].map((entry) => (
              <button
                key={entry}
                onClick={() => setMode(entry)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  mode === entry ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {entry === 'list' ? 'List' : 'Manifest'}
              </button>
            ))}
          </div>
          {mode === 'list' && (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setSearched(search.trim());
              }}
            >
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value.toUpperCase())}
                placeholder="Search ref BL…"
                className="h-9 w-44 font-mono uppercase"
              />
              <Button type="submit" variant="outline" size="icon" className="rounded-xl">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      </div>

      {mode === 'manifest' ? (
        <div className="mt-5">
          <OperatorManifest operator={operator} />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setFilter(entry.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filter === entry.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading tickets…</p>}
        {!loading &&
          bookings.map((booking) => (
            <div key={booking.id} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold tracking-widest">{booking.booking_ref}</p>
                  <p className="mt-0.5 text-sm font-medium">
                    {booking.origin_city} → {booking.destination_city} · {booking.travel_date} · {booking.departure_time}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {(booking.passengers || []).map((p) => p.name).join(', ') || 'No passenger names'} ·{' '}
                    {(booking.seats || []).map((s) => `Seat ${s}`).join(', ')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {booking.contact_name} · {booking.contact_phone}
                    {booking.contact_email ? ` · ${booking.contact_email}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-1.5">
                    <Badge variant={booking.status === 'cancelled' ? 'destructive' : 'secondary'}>
                      {booking.status === 'cancelled' ? 'cancelled' : 'paid'}
                    </Badge>
                    {booking.validated && (
                      <Badge className="bg-[hsl(var(--trust))] text-white">
                        <CheckCircle2 className="h-3 w-3" /> boarded
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-semibold">{formatMoney(booking.amount, booking.currency)}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => checkIn(booking)}
                  disabled={booking.validated || booking.status === 'cancelled'}
                >
                  <CheckCircle2 className="h-4 w-4" /> Check in
                </Button>
                <a href={whatsappLink(booking)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="rounded-xl">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Button>
                </a>
                {booking.contact_email && (
                  <a href={mailtoLink(booking)}>
                    <Button size="sm" variant="outline" className="rounded-xl">
                      <Mail className="h-4 w-4" /> Email
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ))}
        {!loading && !bookings.length && (
          <p className="text-sm text-muted-foreground">
            {searched ? `No tickets match “${searched}”.` : 'No tickets in this view yet.'}
          </p>
        )}
          </div>
        </>
      )}
    </Card>
  );
}
