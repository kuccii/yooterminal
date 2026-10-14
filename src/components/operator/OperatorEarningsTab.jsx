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

export default function OperatorEarningsTab({ operator, setting }) {
  const [state, setState] = useState({
    loading: true,
    totals: null,
    byRoute: [],
    departures: [],
  });

  useEffect(() => {
    let active = true;

    (async () => {
      const [totals, byRoute, holds, schedules] = await Promise.all([
        db.entities.Booking.aggregate({
          query: { operator_slug: operator.slug, status: 'paid' },
          sum: ['amount', 'platform_fee', 'passenger_count'],
          avg: 'amount',
        }),
        db.entities.Booking.aggregate({
          query: { operator_slug: operator.slug, status: 'paid' },
          groupBy: 'route_slug',
          sum: ['amount', 'passenger_count'],
          sort: '-sum_amount',
          limit: 8,
        }),
        db.entities.DepartureSeat.filter(
          { operator_slug: operator.slug },
          { sort: '-travel_date', limit: 100, fields: ['travel_date', 'route_slug', 'departure_time', 'seats'] }
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
      const departures = (holds.items || []).map((hold) => {
        const schedule = scheduleList.find(
          (entry) => entry.route_slug === hold.route_slug && entry.departure_time === hold.departure_time
        );
        const sold = (hold.seats || []).length;
        const capacity = schedule?.seats_total || 0;
        return {
          id: hold.id,
          travel_date: hold.travel_date,
          departure_time: hold.departure_time,
          label: schedule ? `${schedule.origin_city} → ${schedule.destination_city}` : hold.route_slug,
          currency: schedule?.currency || 'UGX',
          sold,
          capacity,
          percent: capacity ? Math.round((sold / capacity) * 100) : 0,
        };
      });

      setState({
        loading: false,
        totals: totals.rows?.[0] || null,
        byRoute: byRoute.rows || [],
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

  const totals = state.totals || {};
  const percent = commissionPercentFor(operator, setting, false);
  const gross = totals.sum_amount || 0;
  const commission = totals.sum_platform_fee || Math.round((gross * percent) / 100);
  const net = gross - commission;
  const tickets = totals.sum_passenger_count || 0;
  const capacity = state.departures.reduce((total, row) => total + row.capacity, 0);
  const sold = state.departures.reduce((total, row) => total + row.sold, 0);
  const load = capacity ? Math.round((sold / capacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ticket revenue"
          value={formatMoney(gross, operator.currency || 'UGX')}
          hint="Fares in different currencies are added together."
          icon={BadgeDollarSign}
        />
        <StatCard label="Passengers carried" value={tickets.toLocaleString('en-US')} icon={Ticket} />
        <StatCard
          label={`Platform commission · ${percent}%`}
          value={formatMoney(commission, operator.currency || 'UGX')}
          hint={operator.commission_percent ? 'Your contracted rate' : 'Platform default rate'}
          icon={Percent}
        />
        <StatCard label="Net payout" value={formatMoney(net, operator.currency || 'UGX')} icon={Users} />
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
                    <TableCell className="text-sm">{row.sum_passenger_count || 0}</TableCell>
                    <TableCell className="text-right text-sm">
                      {formatMoney(row.sum_amount || 0, operator.currency || 'UGX')}
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