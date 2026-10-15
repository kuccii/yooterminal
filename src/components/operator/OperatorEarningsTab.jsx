import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { BadgeDollarSign, Download, Percent, Printer, Ticket, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatCard from '@/components/manage/StatCard';
import { commissionPercentFor } from '@/lib/commission';
import { downloadCsv } from '@/lib/csv';
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

function currentMonth() {
  return format(new Date(), 'yyyy-MM');
}

function previousMonth() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthRange(month) {
  const [year, mon] = month.split('-').map(Number);
  const endYear = mon === 12 ? year + 1 : year;
  const endMonth = mon === 12 ? 1 : mon + 1;
  return { $gte: `${month}-01`, $lt: `${endYear}-${String(endMonth).padStart(2, '0')}-01` };
}

export default function OperatorEarningsTab({ operator, setting }) {
  const [state, setState] = useState({
    loading: true,
    totals: [],
    byRoute: [],
    departures: [],
  });
  const [month, setMonth] = useState(previousMonth);
  const [statement, setStatement] = useState({ loading: true, rows: [], count: 0, tickets: 0 });

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

  useEffect(() => {
    let active = true;

    (async () => {
      setStatement((prev) => ({ ...prev, loading: true }));
      const aggregate = await db.entities.Booking.aggregate({
        query: { operator_slug: operator.slug, status: 'paid', paid_at: monthRange(month) },
        groupBy: 'currency',
        sum: ['amount', 'platform_fee', 'operator_net', 'passenger_count'],
      });
      if (!active) return;
      const rows = (aggregate.rows || []).map((row) => {
        const gross = Number(row.sum_amount) || 0;
        const fee = Number(row.sum_platform_fee) || 0;
        return {
          currency: row.currency || 'UGX',
          gross,
          fee,
          net: row.sum_operator_net ?? gross - fee,
          count: Number(row.count) || 0,
          tickets: Number(row.sum_passenger_count) || 0,
        };
      });
      setStatement({
        loading: false,
        rows,
        count: rows.reduce((total, row) => total + row.count, 0),
        tickets: rows.reduce((total, row) => total + row.tickets, 0),
      });
    })();

    return () => {
      active = false;
    };
  }, [operator.slug, month]);

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

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="no-print flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <BadgeDollarSign className="h-4 w-4 text-primary" /> Payout statement
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Monthly reconciliation: gross fares, the platform commission, and your net payout.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Month</p>
              <Input
                type="month"
                value={month}
                max={currentMonth()}
                onChange={(event) => setMonth(event.target.value || previousMonth())}
                className="w-44"
              />
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              disabled={statement.loading || !statement.rows.length}
              onClick={() =>
                downloadCsv(`statement-${operator.slug}-${month}.csv`, [
                  { label: 'period', value: () => month },
                  { label: 'operator_slug', value: () => operator.slug },
                  { label: 'currency', value: (row) => row.currency },
                  { label: 'gross', value: (row) => row.gross },
                  { label: 'commission', value: (row) => row.fee },
                  { label: 'net', value: (row) => row.net },
                  { label: 'paid_bookings', value: (row) => row.count },
                  { label: 'tickets', value: (row) => row.tickets },
                ], statement.rows)
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        {statement.loading ? (
          <Skeleton className="mt-5 h-32 w-full rounded-2xl" />
        ) : (
          <div className="manifest-print mt-5">
            <div className="border-b border-border pb-4">
              <h3 className="font-display text-lg font-extrabold">{operator.name}</h3>
              <p className="mt-0.5 text-sm font-semibold">
                Payout statement · {format(parseISO(`${month}-01`), 'MMMM yyyy')}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {statement.count} paid booking{statement.count === 1 ? '' : 's'} · {statement.tickets} ticket
                {statement.tickets === 1 ? '' : 's'} · generated {format(new Date(), 'yyyy-MM-dd HH:mm')}
              </p>
            </div>
            {statement.rows.length ? (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Gross fares</TableHead>
                      <TableHead className="text-right">Platform commission</TableHead>
                      <TableHead className="text-right">Net payout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.rows.map((row) => (
                      <TableRow key={row.currency}>
                        <TableCell className="text-sm font-semibold">{row.currency}</TableCell>
                        <TableCell className="text-right text-sm">{formatMoney(row.gross, row.currency)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatMoney(row.fee, row.currency)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {formatMoney(row.net, row.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No paid bookings in this month.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
