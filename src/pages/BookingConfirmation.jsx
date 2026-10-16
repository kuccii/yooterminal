import db from '@/api/client';

import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { CalendarDays, CheckCircle2, LifeBuoy } from 'lucide-react';

import ETicket from '@/components/ETicket';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { readTicket } from '@/lib/bookingRef';
import { formatMoney } from '@/lib/format';

export default function BookingConfirmation() {
  const { ref = '' } = useParams();
  const bookingRef = String(ref).toUpperCase();
  const [state, setState] = useState({ loading: true, booking: null, legs: [], operators: {} });
  const celebrated = useRef(false);

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true }));

    (async () => {
      // The ticket is saved to sessionStorage at checkout for an instant render.
      let booking = readTicket(bookingRef);

      if (!booking) {
        const page = await db.entities.Booking
          .filter({ booking_ref: bookingRef }, { limit: 1 })
          .catch(() => ({ items: [] }));
        booking = page.items?.[0] || null;
      }
      if (!active) return;

      let legs = [];
      if (Array.isArray(booking?.bookings) && booking.bookings.length) {
        legs = booking.bookings;
      } else if (booking?.group_ref) {
        const page = await db.entities.Booking
          .filter({ group_ref: booking.group_ref }, { limit: 6 })
          .catch(() => ({ items: [] }));
        legs = page.items || [];
      }
      if (booking && !legs.length) legs = [booking];
      legs = [...legs].sort((a, b) => Number(a.leg_index ?? 0) - Number(b.leg_index ?? 0));

      const operatorSlugs = [...new Set(legs.map((leg) => leg?.operator_slug).filter(Boolean))];
      const operatorPage = operatorSlugs.length
        ? await db.entities.Operator
            .filter({ slug: { $in: operatorSlugs } }, { limit: 20 })
            .catch(() => ({ items: [] }))
        : { items: [] };
      if (!active) return;

      const operators = Object.fromEntries((operatorPage.items || []).map((item) => [item.slug, item]));

      setState({ loading: false, booking, legs, operators });

      if (booking && booking.status !== 'cancelled' && !celebrated.current) {
        celebrated.current = true;
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 } });
      }
    })();

    return () => {
      active = false;
    };
  }, [bookingRef]);

  if (state.loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="mt-6 h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (!state.booking) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold">We couldn&apos;t find that booking</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with the email you booked with, or quote your reference{' '}
          <span className="font-semibold text-foreground">{bookingRef}</span> to our support team.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link to="/help">
              <LifeBuoy className="mr-2 h-4 w-4" /> Get help
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Back to search</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { booking, legs, operators } = state;
  const isRoundTrip = legs.length > 1;
  const totalPaid = legs.reduce((sum, leg) => sum + Number(leg.amount || 0), 0);
  const refLabel = legs.map((leg) => leg.booking_ref).join(' · ');

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--trust))]" />
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
          {booking.status === 'cancelled' ? 'Booking cancelled' : 'You&apos;re on board!'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reference <span className="font-semibold text-foreground">{refLabel}</span> · a copy of your ticket
          is saved on this device and under My trips.
        </p>
        <p className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {legs.map((leg, index) => (
            <React.Fragment key={leg.booking_ref}>
              {index > 0 && <span aria-hidden="true">·</span>}
              <span>
                {leg.origin_city} → {leg.destination_city} on {leg.travel_date} at {leg.departure_time}
              </span>
            </React.Fragment>
          ))}
        </p>
      </div>

      <div className="mt-8 space-y-6">
        {legs.map((leg, index) => (
          <ETicket
            key={leg.booking_ref}
            booking={leg}
            operator={operators[leg.operator_slug] || null}
            label={isRoundTrip ? (index === 0 ? 'Outbound' : 'Return') : null}
            amountLabel={isRoundTrip ? 'Fare' : 'Amount paid'}
          />
        ))}
      </div>

      {isRoundTrip && (
        <div className="mt-6 flex items-end justify-between rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
          <span className="text-sm font-medium text-muted-foreground">Total paid · both legs</span>
          <span className="font-display text-2xl font-extrabold">{formatMoney(totalPaid, legs[0].currency)}</span>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link to="/trips">View my trips</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">Book another trip</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/help">Need help?</Link>
        </Button>
      </div>
    </div>
  );
}
