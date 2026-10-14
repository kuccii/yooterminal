import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ScanLine, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatMoney } from '@/lib/format';

export default function OperatorValidationTab({ operator, user }) {
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState(null);
  const [message, setMessage] = useState('');
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadRecent = useCallback(async () => {
    const page = await db.entities.Booking.filter(
      { operator_slug: operator.slug, validated: true },
      {
        sort: '-validated_at',
        limit: 8,
        fields: [
          'booking_ref',
          'travel_date',
          'origin_city',
          'destination_city',
          'departure_time',
          'seats',
          'validated_at',
          'validated_by',
        ],
      }
    );
    setRecent(page.items || []);
  }, [operator.slug]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const lookup = async () => {
    const ref = code.trim().toUpperCase();
    if (!ref) return;
    setBusy(true);
    setMessage('');
    setTicket(null);

    const page = await db.entities.Booking.filter({ booking_ref: ref }, { limit: 1 });
    const found = page.items?.[0] || null;

    if (!found) {
      setMessage('No ticket with that reference is on your departures.');
    } else if (found.operator_slug !== operator.slug) {
      setMessage(`That ticket belongs to ${found.operator_name}, not to your departures.`);
    } else {
      setTicket(found);
    }
    setBusy(false);
  };

  const checkIn = async () => {
    setBusy(true);
    await db.entities.Booking.update(ticket.id, {
      validated: true,
      validated_at: new Date().toISOString(),
      validated_by: user?.email || operator.name,
    });
    setMessage(`${ticket.booking_ref} checked in.`);
    setTicket(null);
    setCode('');
    await loadRecent();
    setBusy(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ScanLine className="h-4 w-4 text-primary" /> Ticket validation
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Type the booking reference printed on the passenger&apos;s e-ticket. Every check-in is stamped with your name
          and the time, so two conductors never board the same seat twice.
        </p>

        <div className="mt-5 flex gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => event.key === 'Enter' && lookup()}
            placeholder="BLXXXXXX"
            className="h-11 font-mono uppercase tracking-widest"
          />
          <Button className="h-11 rounded-xl" onClick={lookup} disabled={busy}>
            {busy ? 'Checking…' : 'Check ticket'}
          </Button>
        </div>

        {message && (
          <Alert className="mt-4 rounded-xl">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {ticket && (
          <div className="mt-5 rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xl font-bold tracking-widest">{ticket.booking_ref}</p>
                <p className="text-xs text-muted-foreground">
                  {ticket.origin_city} → {ticket.destination_city} · {ticket.travel_date} · {ticket.departure_time}
                </p>
              </div>
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  ticket.validated
                    ? 'bg-muted text-muted-foreground'
                    : ticket.status === 'cancelled'
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-[hsl(var(--trust))] text-white'
                }`}
              >
                {ticket.validated ? (
                  <TriangleAlert className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {ticket.validated ? 'already checked in' : ticket.status === 'cancelled' ? 'cancelled' : 'valid'}
              </span>
            </div>

            <Separator className="my-4" />

            <div className="space-y-2">
              {(ticket.passengers || []).map((passenger) => (
                <div key={passenger.seat} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{passenger.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{passenger.phone}</span>
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
                      Seat {passenger.seat}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <p>
                Contact: {ticket.contact_name} · {ticket.contact_phone}
              </p>
              <p className="sm:text-right">
                Paid {formatMoney(ticket.amount, ticket.currency)}
                {ticket.coupon_code ? ` · code ${ticket.coupon_code}` : ''}
              </p>
            </div>

            <Button
              className="mt-5 h-11 w-full rounded-xl"
              onClick={checkIn}
              disabled={busy || ticket.validated || ticket.status === 'cancelled'}
            >
              {ticket.validated ? 'Already checked in' : 'Check in this passenger'}
            </Button>
          </div>
        )}
      </Card>

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold">Last check-ins</h2>
        <p className="mt-1 text-sm text-muted-foreground">The most recent tickets your crew boarded.</p>
        <div className="mt-5 space-y-3">
          {recent.map((booking) => (
            <div key={booking.id} className="rounded-2xl border border-border p-3">
              <p className="font-mono text-sm font-semibold tracking-widest">{booking.booking_ref}</p>
              <p className="text-xs text-muted-foreground">
                {booking.origin_city} → {booking.destination_city} · {booking.travel_date} ·{' '}
                {(booking.seats || []).join(', ')}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {booking.validated_by} ·{' '}
                {booking.validated_at ? new Date(booking.validated_at).toLocaleString() : ''}
              </p>
            </div>
          ))}
          {!recent.length && <p className="text-sm text-muted-foreground">No tickets checked in yet.</p>}
        </div>
      </Card>
    </div>
  );
}