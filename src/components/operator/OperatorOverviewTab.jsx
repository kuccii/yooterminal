import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { addMonths, differenceInMinutes, format, formatDistanceToNow, parseISO } from 'date-fns';
import { ArrowRight, CalendarClock, Ticket, TrendingUp, Users, Wallet } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import StatCard from '@/components/manage/StatCard';
import { formatMoney } from '@/lib/format';
import { parseTripKey, tripKeyOf } from '@/lib/trips';

const CHIP_STYLES = {
  soon: 'bg-amber-100 text-amber-700',
  ontime: 'bg-[hsl(var(--trust))] text-white',
  gone: 'bg-muted text-muted-foreground',
};

function chipFor(minutes) {
  if (minutes < 0) return { label: 'departed', style: CHIP_STYLES.gone };
  if (minutes <= 120) return { label: 'boarding soon', style: CHIP_STYLES.soon };
  return { label: 'on time', style: CHIP_STYLES.ontime };
}

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

export default function OperatorOverviewTab({ operator, routes = [], onNavigate }) {
  const [state, setState] = useState({
    loading: true,
    revenue: [],
    bookings: 0,
    passengers: 0,
    capacity: 0,
    recent: [],
    topRoutes: [],
    departures: [],
    monthLabel: '',
  });

  useEffect(() => {
    let active = true;

    (async () => {
      setState((prev) => ({ ...prev, loading: true }));

      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const monthStart = format(now, 'yyyy-MM-01');
      const monthEnd = format(addMonths(now, 1), 'yyyy-MM-01');

      const [monthBookings, recent, todayTrips, schedules] = await Promise.all([
        db.entities.Booking.filter(
          { operator_slug: operator.slug, status: 'paid', paid_at: { $gte: monthStart, $lt: monthEnd } },
          {
            sort: '-paid_at',
            limit: 1000,
            fields: [
              'amount',
              'currency',
              'passenger_count',
              'trip_key',
              'route_slug',
              'origin_city',
              'destination_city',
            ],
          }
        ),
        db.entities.Booking.filter(
          { operator_slug: operator.slug, status: 'paid' },
          {
            sort: '-paid_at',
            limit: 5,
            fields: [
              'booking_ref',
              'origin_city',
              'destination_city',
              'travel_date',
              'departure_time',
              'seats',
              'amount',
              'currency',
              'paid_at',
            ],
          }
        ),
        db.entities.Booking.aggregate({
          query: { operator_slug: operator.slug, status: 'paid', travel_date: today },
          groupBy: 'trip_key',
          sum: ['passenger_count'],
          sort: '-sum_passenger_count',
          limit: 100,
        }),
        db.entities.Schedule.filter(
          { operator_slug: operator.slug },
          {
            limit: 200,
            fields: [
              'route_slug',
              'departure_time',
              'seats_total',
              'origin_city',
              'destination_city',
              'bus_class',
              'bus_plate',
              'active',
              'operator_status',
            ],
          }
        ),
      ]);
      if (!active) return;

      const rows = monthBookings.items || [];
      const scheduleList = schedules.items || [];

      const revenueMap = new Map();
      let passengers = 0;
      rows.forEach((row) => {
        const currency = row.currency || 'UGX';
        revenueMap.set(currency, (revenueMap.get(currency) || 0) + (Number(row.amount) || 0));
        passengers += Number(row.passenger_count) || 0;
      });
      const revenue = [...revenueMap.entries()]
        .map(([currency, value]) => ({ currency, value }))
        .sort((a, b) => a.currency.localeCompare(b.currency));

      const tripKeys = [...new Set(rows.map((row) => row.trip_key).filter(Boolean))];
      const capacity = tripKeys.reduce((total, key) => {
        const parts = parseTripKey(key);
        const schedule = scheduleList.find(
          (entry) => entry.route_slug === parts.route_slug && entry.departure_time === parts.departure_time
        );
        return total + (Number(schedule?.seats_total) || 0);
      }, 0);

      const todayByTrip = new Map();
      (todayTrips.rows || []).forEach((row) => {
        if (row.trip_key) todayByTrip.set(row.trip_key, Number(row.sum_passenger_count) || 0);
      });

      const departures = scheduleList
        .filter((entry) => entry.active !== false && (entry.operator_status || 'approved') === 'approved')
        .map((entry) => {
          const key = tripKeyOf(entry.route_slug, operator.slug, entry.departure_time, today);
          const minutes = differenceInMinutes(parseISO(`${today}T${entry.departure_time}:00`), now);
          return {
            id: key,
            time: entry.departure_time,
            label: `${entry.origin_city} → ${entry.destination_city}`,
            bus: [entry.bus_plate, entry.bus_class].filter(Boolean).join(' · '),
            sold: todayByTrip.get(key) || 0,
            capacity: Number(entry.seats_total) || 0,
            minutes,
          };
        })
        .sort((a, b) => a.time.localeCompare(b.time));

      const topMap = new Map();
      rows.forEach((row) => {
        const key = row.route_slug || 'unknown';
        const entry = topMap.get(key) || { route_slug: key, count: 0, passengers: 0, revenue: {} };
        entry.count += 1;
        entry.passengers += Number(row.passenger_count) || 0;
        const currency = row.currency || 'UGX';
        entry.revenue[currency] = (entry.revenue[currency] || 0) + (Number(row.amount) || 0);
        topMap.set(key, entry);
      });
      const topRoutes = [...topMap.values()].sort((a, b) => b.passengers - a.passengers).slice(0, 5);

      setState({
        loading: false,
        revenue,
        bookings: rows.length,
        passengers,
        capacity,
        recent: recent.items || [],
        topRoutes,
        departures,
        monthLabel: format(now, 'MMMM yyyy'),
      });
    })();

    return () => {
      active = false;
    };
  }, [operator.slug]);

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

  const load = state.capacity ? Math.round((state.passengers / state.capacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ticket revenue"
          value={moneyValue(state.revenue, operator.currency || 'UGX')}
          hint={`Paid in ${state.monthLabel}`}
          icon={Wallet}
        />
        <StatCard
          label="Tickets sold"
          value={state.bookings.toLocaleString('en-US')}
          hint="Paid bookings this month"
          icon={Ticket}
        />
        <StatCard
          label="Passengers carried"
          value={state.passengers.toLocaleString('en-US')}
          hint="Booked seats this month"
          icon={Users}
        />
        <StatCard
          label="Seat load factor"
          value={`${load}%`}
          hint={
            state.capacity
              ? `${state.passengers} of ${state.capacity} seats on sold trips`
              : 'No seats sold this month yet'
          }
          icon={TrendingUp}
        />
      </div>

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <CalendarClock className="h-4 w-4 text-primary" /> Today&apos;s departures
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {format(new Date(), 'EEEE d MMMM')} · seats sold so far on each departure.
        </p>

        <div className="mt-4 space-y-3">
          {state.departures.map((row) => {
            const chip = chipFor(row.minutes);
            return (
              <div key={row.id} className="rounded-2xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-extrabold">{row.time}</span>
                    <div>
                      <p className="text-sm font-semibold">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.bus || 'Bus to be assigned'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${chip.style}`}>
                      {chip.label}
                    </span>
                    <span className="text-sm font-semibold">
                      {row.sold}/{row.capacity}
                    </span>
                  </div>
                </div>
                <Progress value={row.capacity ? Math.round((row.sold / row.capacity) * 100) : 0} className="mt-2 h-1.5" />
              </div>
            );
          })}
          {!state.departures.length && (
            <p className="text-sm text-muted-foreground">No departures scheduled for today.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border-border p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Ticket className="h-4 w-4 text-primary" /> Recent bookings
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('bookings')}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {state.recent.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-3"
              >
                <div>
                  <p className="font-mono text-xs font-bold tracking-widest">{booking.booking_ref}</p>
                  <p className="mt-0.5 text-sm font-medium">
                    {booking.origin_city} → {booking.destination_city}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {booking.travel_date} · departs {booking.departure_time} · {(booking.seats || []).length} seat
                    {(booking.seats || []).length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(booking.amount, booking.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {booking.paid_at ? formatDistanceToNow(new Date(booking.paid_at), { addSuffix: true }) : ''}
                  </p>
                </div>
              </div>
            ))}
            {!state.recent.length && (
              <p className="text-sm text-muted-foreground">No paid tickets yet. They will show up here.</p>
            )}
          </div>
        </Card>

        <Card className="rounded-3xl border-border p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <TrendingUp className="h-4 w-4 text-primary" /> Top routes this month
          </h2>

          <div className="mt-4 space-y-4">
            {state.topRoutes.map((row) => {
              const route = routes.find((entry) => entry.slug === row.route_slug);
              const max = state.topRoutes[0]?.count || 1;
              return (
                <div key={row.route_slug}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {route ? `${route.origin_city} → ${route.destination_city}` : row.route_slug.replace(/-/g, ' → ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.count} ticket{row.count === 1 ? '' : 's'} · {row.passengers} passenger
                      {row.passengers === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${Math.max(6, Math.round((row.count / max) * 100))}%` }}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {Object.entries(row.revenue).map(([currency, value]) => (
                      <p key={currency} className="text-xs font-medium text-muted-foreground">
                        {formatMoney(value, currency)}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
            {!state.topRoutes.length && (
              <p className="text-sm text-muted-foreground">No paid tickets this month yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
