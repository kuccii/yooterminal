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

const groupKey = (members) => members[0].group_ref || members[0].id;

const groupBookings = (rows) => {
  const seen = new Set();
  const groups = [];
  for (const row of rows) {
    if (row.group_ref) {
      if (seen.has(row.group_ref)) continue;
      seen.add(row.group_ref);
      groups.push(
        rows
          .filter((item) => item.group_ref === row.group_ref)
          .sort((a, b) => Number(a.leg_index ?? 0) - Number(b.leg_index ?? 0)),
      );
    } else {
      groups.push([row]);
    }
  }
  return groups;
};

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

  const cancelBooking = async (members) => {
    const isGroup = members.length > 1;
    const label = members.map((member) => member.booking_ref).join(' / ');
    const ok = window.confirm(
      isGroup
        ? `Cancel round trip ${label}? Both legs are released together and one full refund is requested automatically.`
        : `Cancel ticket ${members[0].booking_ref} (${(members[0].seats || []).join(', ')})? Seats are released and any eligible refund is requested automatically.`,
    );
    if (!ok) return;
    setCancelling(groupKey(members));
    setCancelNote('');
    try {
      const target = members.find((member) => member.status === 'paid') || members[0];
      const res = await fetch('/api/payments/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_ref: target.booking_ref }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelNote(body.error || 'We could not cancel this ticket.');
      } else if (body.refund_status === 'refunded') {
        setCancelNote(`${label} cancelled — your refund has been requested with the payment provider.`);
      } else if (body.refund_status === 'refund_pending') {
        setCancelNote(`${label} cancelled — the refund is pending; our team will confirm it shortly.`);
      } else {
        setCancelNote(`${label} cancelled.`);
      }
    } catch {
      setCancelNote('We could not cancel this ticket. Please try again.');
    }
    setCancelling(null);
  };

  const today = todayISO();
  const groups = groupBookings(bookings);
  const isActiveGroup = (members) => members.some((item) => item.travel_date >= today && item.status !== 'cancelled');
  const upcoming = groups.filter(isActiveGroup);
  const past = groups.filter((members) => !isActiveGroup(members));

  const renderList = (list, emptyText) => {
    if (!list.length) {
      return <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
    }
    return (
      <div className="space-y-4">
        {list.map((members) => {
          const key = groupKey(members);
          const isGroup = members.length > 1;
          const total = members.reduce((sum, member) => sum + Number(member.amount || 0), 0);
          const primary = members[0];
          const allCancelled = members.every((member) => member.status === 'cancelled');
          const seatLabel = members.map((member) => (member.seats || []).join(', ')).join(' · ');
          return (
            <div key={key} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-bold">
                    {isGroup
                      ? `${primary.origin_city} → ${primary.destination_city} round trip`
                      : `${primary.origin_city} → ${primary.destination_city}`}
                  </p>
                  <div className="mt-0.5 space-y-0.5">
                    {members.map((leg) => (
                      <p
                        key={leg.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
                      >
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" /> {leg.travel_date} at {leg.departure_time}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {leg.operator_name}
                        </span>
                        {isGroup && (
                          <span>
                            {leg.origin_city} → {leg.destination_city}
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-extrabold">{formatMoney(total, primary.currency)}</p>
                  <p className="text-xs text-muted-foreground">{allCancelled ? 'Cancelled' : `Seats ${seatLabel}`}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setExpanded(expanded === key ? null : key)}
                >
                  {expanded === key ? 'Hide ticket' : 'View ticket'}
                </Button>
                <Button asChild variant="ghost" size="sm" className="rounded-lg">
                  <Link to={`/routes/${primary.route_slug}`}>Route info</Link>
                </Button>
                {!allCancelled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-destructive hover:bg-destructive/10"
                    disabled={cancelling === key}
                    onClick={() => cancelBooking(members)}
                  >
                    {cancelling === key && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    {isGroup ? 'Cancel trip' : 'Cancel ticket'}
                  </Button>
                )}
              </div>
              {expanded === key && (
                <div className="mt-4 space-y-4">
                  {members.map((leg, index) => (
                    <ETicket
                      key={leg.booking_ref}
                      booking={leg}
                      label={isGroup ? (index === 0 ? 'Outbound' : 'Return') : null}
                      amountLabel={isGroup ? 'Fare' : 'Amount paid'}
                    />
                  ))}
                  {isGroup && (
                    <div className="flex items-end justify-between rounded-2xl border border-border px-5 py-4">
                      <span className="text-sm font-medium text-muted-foreground">Total paid · both legs</span>
                      <span className="font-display text-xl font-extrabold">
                        {formatMoney(total, primary.currency)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
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