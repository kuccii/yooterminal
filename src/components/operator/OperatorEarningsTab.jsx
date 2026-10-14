import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { BadgeDollarSign, Percent, Ticket, Users } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatCard from '@/components/manage/StatCard';
import { commissionPercentFor } from '@/lib/commission';
import { formatMoney } from '@/lib/format';

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

export default function OperatorEarningsTab({ operator, setting }) {
  const [state, setState] = useState({
    loading: true,
    totals: [],
    byRoute: [],
    departures: [],
  });

  useEffect(() => {
    let active = true;

    (async () => {
      const query = { operator_slug: operator.slug, status: 'paid' };
      const totals = await db.entities.Booking.aggregate({
        query,
        groupBy: 'currency',
        sum: ['amount', 'platform_fee', 'operator_net', 'passenger_count'],
      });
      const currencies = [...new Set((totals.rows || []).map((row) => row.currency || 'UGX'))];

      const [routeAggs, holds, schedules] = await Promise.all([
        Promise.all(
          currencies.map((currency) =>
            db.entities.Booking.aggregate({
              query: { ...query, currency },
              groupBy: 'route_slug',
              sum: ['amount', 'passenger_count'],
              sort: '-sum_amount',
              limit: 8,
            })
          )
        ),
        db.entities.DepartureSeat.filter(
          { operator_slug: operator.slug },
          {
            sort: '-travel_date',
            limit: 100,
            fields: ['trip_key', 'travel_date', 'route_slug', 'departure_time', 'seats'],
          }
        ),
        db.entities.Schedule.filter(
          { operator_slug: operator.slug },
          {
            limit: 100,
            fields: [
              'route_slug',
              'departure_time',
              'seats_total',
              'origin_city',
              'destination_city',
              'currency',
            ],
          }
        ),
      ]);
      if (!active) return;

      const scheduleList = schedules.items || [];

      const byTrip = new Map();
      (holds.items || []).forEach((hold) => {
        const key = hold.trip_key || `${hold.route_slug}~${hold.departure_time}~${hold.travel_date}`;
        const entry = byTrip.get(key) || {
          travel_date: hold.travel_date,
          route_slug: hold.route_slug,
          departure_time: hold.departure_time,
          sold: 0,
        };
        entry.sold += (hold.seats || []).length;
        byTrip.set(key, entry);
      });
      const departures = [...byTrip.entries()].map(([key, entry]) => {
        const schedule = scheduleList.find(
          (item) => item.route_slug === entry.route_slug && item.departure_time === entry.departure_time
        );
        const capacity = Number(schedule?.seats_total) || 0;
        return {
          id: key,
          travel_date: entry.travel_date,
          departure_time: entry.departure_time,
          label: schedule ? `${schedule.origin_city} → ${schedule.destination_city}` : entry.route_slug,
          currency: schedule?.currency || 'UGX',
          sold: entry.sold,
          capacity,
          percent: capacity ? Math.round((entry.sold / capacity) * 100) : 0,
        };
      });

      const routeMap = new Map();
      routeAggs.forEach((agg, index) => {
        const currency = currencies[index];
        (agg.rows || []).forEach((row) => {
          const entry = routeMap.get(row.route_slug) || { route_slug: row.route_slug, tickets: 0, revenue: {} };
          entry.tickets += Number(row.sum_passenger_count) || 0;
          entry.revenue[currency] = (entry.revenue[currency] || 0) + (Number(row.sum_amount) || 0);
          routeMap.set(row.route_slug, entry);
        });
      });
      const byRoute = [...routeMap.values()].sort((a, b) => b.tickets - a.tickets);

      setState({
        loading: false,
        totals: totals.rows || [],
        byRoute,
        departures,
      });
    })();

    return () => {
      active = false;
    };
  }, [operator.slug]);

  if (state.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  const percent = commissionPercentFor(operator, setting, false);
  const fallbackCurrency = operator.currency || 'UGX';
  const splitRows = state.totals.map((row) => {
    const gross = Number(row.sum_amount) || 0;
    const fee = row.sum_platform_fee ?? Math.round((gross * percent) / 100);
    return {
      currency: row.currency || 'UGX',
      gross,
      fee,
      net: row.sum_operator_net ?? gross - fee,
    };
  });
  const tickets = state.totals.reduce((total, row) => total + (Number(row.sum_passenger_count) || 0), 0);
  const paidCount = state.totals.reduce((total, row) => total + (Number(row.count) || 0), 0);
  const capacity = state.departures.reduce((total, row) => total + row.capacity, 0);
  const sold = state.departures.reduce((total, row) => total + row.sold, 0);
  const load = capacity ? Math.round((sold / capacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ticket revenue"
          value={moneyValue(
            splitRows.map((row) => ({ currency: row.currency, value: row.gross })),
            fallbackCurrency
          )}
          hint={`${paidCount} paid ticket${paidCount === 1 ? '' : 's'}`}
          icon={BadgeDollarSign}
        />
        <StatCard label="Passengers carried" value={tickets.toLocaleString('en-US')} icon={Ticket} />
        <StatCard
          label={`Platform commission · ${percent}%`}
          value={moneyValue(
            splitRows.map((row) => ({ currency: row.currency, value: row.fee })),
            fallbackCurrency
          )}
          hint={operator.commission_percent ? 'Your contracted rate' : 'Platform default rate'}
          icon={Percent}
        />
        <StatCard
          label="Net payout"
          value={moneyValue(
            splitRows.map((row) => ({ currency: row.currency, value: row.net })),
            fallbackCurrency
          )}
          icon={Users}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border-border p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold">Seat occupancy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sold} of {capacity} seats sold across your recent departures.
          </p>
          <Progress value={load} className="mt-4 h-2" />
          <p className="mt-2 text-xs font-semibold text-primary">{load}% full on average</p>

          <div className="mt-5 space-y-3">
            {state.departures.slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-2xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.travel_date} · departs {row.departure_time}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">
                    {row.sold}/{row.capacity}
                  </span>
                </div>
                <Progress value={row.percent} className="mt-2 h-1.5" />
              </div>
            ))}
            {!state.departures.length && (
              <p className="text-sm text-muted-foreground">No seats sold yet on this operator&apos;s departures.</p>
            )}
          </div>
        </Card>

        <Card className="rounded-3xl border-border p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold">Revenue by route</h2>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Passengers</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.byRoute.map((row) => (
                  <TableRow key={row.route_slug}>
                    <TableCell className="text-sm font-medium">{row.route_slug.replace(/-/g, ' → ')}</TableCell>
                    <TableCell className="text-sm">{row.tickets}</TableCell>
                    <TableCell className="text-right text-sm">
                      {Object.entries(row.revenue).map(([currency, value]) => (
                        <p key={currency}>{formatMoney(value, currency)}</p>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
                {!state.byRoute.length && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      Nothing sold yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
