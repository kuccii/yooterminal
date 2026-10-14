import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { BadgeDollarSign, Bus, CheckCircle2, Clock, Ticket, Users, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatCard from '@/components/manage/StatCard';
import { formatDateTime, formatMoney, todayISO } from '@/lib/format';
import { parseTripKey } from '@/lib/trips';

function moneyValue(entries, fallback) {
  if (entries.length === 1) return formatMoney(entries[0].value, entries[0].currency);
  if (!entries.length) return formatMoney(0, fallback);
  return (
    <span className="flex flex-col gap-0.5 text-xl">
      {entries.map((entry) => (
        <span key={entry.currency}>{formatMoney(entry.value, entry.currency)}</span>
      ))}
    </span>
  );
}

export default function AdminOverviewTab({ operators, routes, onChanged, onNavigate }) {
  const [state, setState] = useState({ loading: true, totals: [], recent: [], busiest: [] });
  const [handled, setHandled] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      const today = todayISO();
      const [totals, recent, busiest] = await Promise.all([
        db.entities.Booking.aggregate({
          query: { status: 'paid' },
          groupBy: 'currency',
          sum: ['platform_fee', 'amount'],
        }),
        db.entities.Booking.filter(
          { status: 'paid' },
          {
            sort: '-paid_at',
            limit: 8,
            fields: [
              'booking_ref',
              'origin_city',
              'destination_city',
              'travel_date',
              'departure_time',
              'operator_name',
              'amount',
              'currency',
              'paid_at',
            ],
          }
        ),
        db.entities.Booking.aggregate({
          query: { status: 'paid', travel_date: today },
          groupBy: 'trip_key',
          sum: ['passenger_count'],
          sort: '-sum_passenger_count',
          limit: 5,
        }),
      ]);
      if (!active) return;
      setState({
        loading: false,
        totals: totals.rows || [],
        recent: recent.items || [],
        busiest: busiest.rows || [],
      });
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setHandled([]);
  }, [operators]);

  const decide = async (operator, status) => {
    setBusyId(operator.id);
    setError('');
    setHandled((prev) => [...prev, operator.id]);
    try {
      await db.entities.Operator.update(operator.id, { status });
      await db.entities.Schedule.updateMany({ operator_slug: operator.slug }, { $set: { operator_status: status } });
      await onChanged();
    } catch (err) {
      setHandled((prev) => prev.filter((id) => id !== operator.id));
      setError(err?.message || 'Could not update that operator. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (state.loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  const totalBookings = state.totals.reduce((total, row) => total + (Number(row.count) || 0), 0);
  const activeOperators = operators.filter((entry) => (entry.status || 'pending') === 'approved').length;
  const pendingOperators = operators.filter(
    (entry) => (entry.status || 'pending') === 'pending' && !handled.includes(entry.id)
  );
  const fees = state.totals.map((row) => ({ currency: row.currency || 'UGX', value: Number(row.sum_platform_fee) || 0 }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tickets sold"
          value={totalBookings.toLocaleString('en-US')}
          hint="Paid bookings all time"
          icon={Ticket}
        />
        <StatCard
          label="Platform revenue"
          value={moneyValue(fees, 'UGX')}
          hint="Commission kept on paid fares"
          icon={BadgeDollarSign}
        />
        <StatCard
          label="Approved operators"
          value={`${activeOperators} / ${operators.length}`}
          hint="Trading on the network"
          icon={Bus}
        />
        <button
          type="button"
          onClick={() => onNavigate('operators')}
          className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            <Clock className="h-3.5 w-3.5" /> Pending approvals
          </p>
          <p className="mt-2 font-display text-2xl font-extrabold tracking-tight text-amber-600">
            {pendingOperators.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Review them in Operators →</p>
        </button>
      </div>

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Users className="h-4 w-4 text-primary" /> Pending approvals
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve a company to put its departures on sale. Rejecting keeps the company and its schedules off sale until
          you approve it later.
        </p>
        {error && <p className="mt-3 text-xs font-semibold text-destructive">{error}</p>}

        <div className="mt-4 space-y-3">
          {pendingOperators.map((operator) => (
            <div
              key={operator.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
            >
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {operator.name}
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-primary">
                    pending
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {operator.country} · {operator.owner_email || 'No dashboard owner yet'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Added {operator.created_date ? formatDateTime(operator.created_date) : 'recently'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="rounded-lg"
                  disabled={busyId === operator.id}
                  onClick={() => decide(operator, 'approved')}
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  disabled={busyId === operator.id}
                  onClick={() => decide(operator, 'suspended')}
                >
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          ))}
          {!pendingOperators.length && (
            <p className="text-sm text-muted-foreground">
              {handled.length ? 'Updating the network…' : 'Every operator on the network is approved.'}
            </p>
          )}
        </div>
      </Card>

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Ticket className="h-4 w-4 text-primary" /> Recent bookings
        </h2>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Travel</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.recent.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell className="font-mono text-xs font-bold tracking-widest">{booking.booking_ref}</TableCell>
                  <TableCell className="text-sm">
                    {booking.origin_city} → {booking.destination_city}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {booking.travel_date} · {booking.departure_time}
                  </TableCell>
                  <TableCell className="text-sm">{booking.operator_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {booking.paid_at ? formatDistanceToNow(new Date(booking.paid_at), { addSuffix: true }) : ''}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold">
                    {formatMoney(booking.amount, booking.currency)}
                  </TableCell>
                </TableRow>
              ))}
              {!state.recent.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    No paid bookings yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Bus className="h-4 w-4 text-primary" /> Busiest departures today
        </h2>
        <div className="mt-4 space-y-3">
          {state.busiest.map((row, index) => {
            const parts = parseTripKey(row.trip_key);
            const route = routes.find((entry) => entry.slug === parts.route_slug);
            const seats = Number(row.sum_passenger_count) || 0;
            return (
              <div
                key={row.trip_key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {route
                        ? `${route.origin_city} → ${route.destination_city}`
                        : (parts.route_slug || '').replace(/-/g, ' → ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {parts.travel_date} · departs {parts.departure_time}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold">
                  {seats} passenger{seats === 1 ? '' : 's'}
                </p>
              </div>
            );
          })}
          {!state.busiest.length && (
            <p className="text-sm text-muted-foreground">No tickets sold for today&apos;s departures yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
