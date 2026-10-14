import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Loader2, MapPin } from 'lucide-react';

import ETicket from '@/components/ETicket';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/AuthContext';
import { formatMoney, todayISO } from '@/lib/format';

export default function MyTrips() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [cancelNote, setCancelNote] = useState('');

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    db.entities.Booking
      .filter({ created_by_id: user.id }, { sort: '-travel_date', limit: 50 })
      .then((page) => {
        if (active) {
          setBookings(page.items || []);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [user?.id, cancelling]);

  const cancelBooking = async (booking) => {
    const ok = window.confirm(
      `Cancel ticket ${booking.booking_ref} (${(booking.seats || []).join(', ')})? Seats are released and any eligible refund is requested automatically.`,
    );
    if (!ok) return;
    setCancelling(booking.id);
    setCancelNote('');
    try {
      const res = await fetch('/api/payments/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_ref: booking.booking_ref }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelNote(body.error || 'We could not cancel this ticket.');
      } else if (body.refund_status === 'refunded') {
        setCancelNote(`${booking.booking_ref} cancelled — your refund has been requested with the payment provider.`);
      } else if (body.refund_status === 'refund_pending') {
        setCancelNote(`${booking.booking_ref} cancelled — the refund is pending; our team will confirm it shortly.`);
      } else {
        setCancelNote(`${booking.booking_ref} cancelled.`);
      }
    } catch {
      setCancelNote('We could not cancel this ticket. Please try again.');
    }
    setCancelling(null);
  };

  const today = todayISO();
  const upcoming = bookings.filter((booking) => booking.travel_date >= today && booking.status !== 'cancelled');
  const past = bookings.filter((booking) => booking.travel_date < today || booking.status === 'cancelled');

  const renderList = (list, emptyText) => {
    if (!list.length) {
      return <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
    }
    return (
      <div className="space-y-4">
        {list.map((booking) => (
          <div key={booking.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold">
                  {booking.origin_city} → {booking.destination_city}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" /> {booking.travel_date} at {booking.departure_time}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {booking.operator_name}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-extrabold">{formatMoney(booking.amount, booking.currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {booking.status === 'cancelled' ? 'Cancelled' : `Seats ${(booking.seats || []).join(', ')}`}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg"
                onClick={() => setExpanded(expanded === booking.id ? null : booking.id)}
              >
                {expanded === booking.id ? 'Hide ticket' : 'View ticket'}
              </Button>
              <Button asChild variant="ghost" size="sm" className="rounded-lg">
                <Link to={`/routes/${booking.route_slug}`}>Route info</Link>
              </Button>
              {booking.status !== 'cancelled' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-destructive hover:bg-destructive/10"
                  disabled={cancelling === booking.id}
                  onClick={() => cancelBooking(booking)}
                >
                  {cancelling === booking.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Cancel ticket
                </Button>
              )}
            </div>
            {expanded === booking.id && (
              <div className="mt-4">
                <ETicket booking={booking} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">My trips</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every ticket you booked with {user?.email}. Open a trip to show your e-ticket at boarding.
      </p>
      {cancelNote && (
        <p className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">{cancelNote}</p>
      )}

      <Tabs defaultValue="upcoming" className="mt-8">
        <TabsList className="rounded-xl">
          <TabsTrigger value="upcoming" className="rounded-lg">
            Upcoming ({upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="past" className="rounded-lg">
            Past ({past.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          {loading ? <Skeleton className="h-32 w-full rounded-2xl" /> : renderList(upcoming, 'You have no upcoming trips yet.')}
        </TabsContent>
        <TabsContent value="past" className="mt-6">
          {loading ? <Skeleton className="h-32 w-full rounded-2xl" /> : renderList(past, 'Your past tickets will appear here.')}
        </TabsContent>
      </Tabs>
    </div>
  );
}