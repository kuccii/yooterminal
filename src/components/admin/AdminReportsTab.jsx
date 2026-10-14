import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { BadgeDollarSign, Bus, Percent, Ticket, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatCard from '@/components/manage/StatCard';
import { formatMoney } from '@/lib/format';

const SERIES_FILLS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

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

function moneyLines(map) {
  return Object.entries(map).map(([currency, value]) => (
    <p key={currency}>{formatMoney(value, currency)}</p>
  ));
}

export default function AdminReportsTab({ operators, routes }) {
  const [state, setState] = useState({
    loading: true,
    totals: [],
    currencies: [],
    byDate: [],
    byRoute: [],
    byOperator: [],
  });

  useEffect(() => {
    let active = true;

    (async () => {
      const totals = await db.entities.Booking.aggregate({
        query: { status: 'paid' },
        groupBy: 'currency',
        sum: ['amount', 'platform_fee', 'passenger_count'],
      });
      const currencyRows = totals.rows || [];
      const currencies = [...new Set(currencyRows.map((row) => row.currency || 'UGX'))];

      const [dateAggs, routeAggs, operatorAggs] = await Promise.all([
        Promise.all(
          currencies.map((currency) =>
            db.entities.Booking.aggregate({
              query: { status: 'paid', currency },
              groupBy: 'travel_date',
              sum: ['amount'],
              sort: 'travel_date',
              limit: 30,
            })
          )
        ),
        Promise.all(
          currencies.map((currency) =>
            db.entities.Booking.aggregate({
              query: { status: 'paid', currency },
              groupBy: 'route_slug',
              sum: ['amount', 'passenger_count'],
              sort: '-sum_amount',
              limit: 10,
            })
          )
        ),
        Promise.all(
          currencies.map((currency) =>
            db.entities.Booking.aggregate({
              query: { status: 'paid', currency },
              groupBy: 'operator_name',
              sum: ['amount', 'platform_fee', 'passenger_count'],
              sort: '-sum_amount',
              limit: 20,
            })
          )
        ),
      ]);
      if (!active) return;

      const dateMap = new Map();
      dateAggs.forEach((agg, index) => {
        const currency = currencies[index];
        (agg.rows || []).forEach((row) => {
          const entry = dateMap.get(row.travel_date) || { travel_date: row.travel_date };
          entry[currency] = Number(row.sum_amount) || 0;
          dateMap.set(row.travel_date, entry);
        });
      });
      const byDate = [...dateMap.values()]
        .sort((a, b) => a.travel_date.localeCompare(b.travel_date))
        .slice(-14);

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
      const byRoute = [...routeMap.values()].sort((a, b) => b.tickets - a.tickets).slice(0, 10);

      const operatorMap = new Map();
      operatorAggs.forEach((agg, index) => {
        const currency = currencies[index];
        (agg.rows || []).forEach((row) => {
          const entry = operatorMap.get(row.operator_name) || {
            operator_name: row.operator_name,
            tickets: 0,
            gross: {},
            fee: {},
          };
          entry.tickets += Number(row.sum_passenger_count) || 0;
          entry.gross[currency] = (entry.gross[currency] || 0) + (Number(row.sum_amount) || 0);
          entry.fee[currency] = (entry.fee[currency] || 0) + (Number(row.sum_platform_fee) || 0);
          operatorMap.set(row.operator_name, entry);
        });
      });
      const byOperator = [...operatorMap.values()].sort((a, b) => b.tickets - a.tickets);

      setState({
        loading: false,
        totals: currencyRows,
        currencies,
        byDate,
        byRoute,
        byOperator,
      });
    })();

    return () => {
      active = false;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
    );
  }

  const totalBookings = state.totals.reduce((total, row) => total + (Number(row.count) || 0), 0);
  const tickets = state.totals.reduce((total, row) => total + (Number(row.sum_passenger_count) || 0), 0);
  const pending = operators.filter((operator) => (operator.status || 'pending') !== 'approved').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tickets sold" value={tickets.toLocaleString('en-US')} icon={Ticket} />
        <StatCard
          label="Gross booking value"
          value={moneyValue(
            state.totals.map((row) => ({ currency: row.currency || 'UGX', value: Number(row.sum_amount) || 0 })),
            'UGX'
          )}
          hint={`${totalBookings} paid booking${totalBookings === 1 ? '' : 's'}`}
          icon={BadgeDollarSign}
        />
        <StatCard
          label="Commission earned"
          value={moneyValue(
            state.totals.map((row) => ({ currency: row.currency || 'UGX', value: Number(row.sum_platform_fee) || 0 })),
            'UGX'
          )}
          hint="Platform share of gross fares"
          icon={Percent}
        />
        <StatCard
          label="Operators needing review"
          value={pending}
          hint={`${operators.length} operators on the network`}
          icon={Bus}
        />
      </div>

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <TrendingUp className="h-4 w-4 text-primary" /> Bookings by travel date
        </h2>
        {state.byDate.length ? (
          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={state.byDate}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="travel_date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(value, name) => [formatMoney(value, name), 'Booked value']}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))' }}
                />
                {state.currencies.length > 1 && <Legend />}
                {state.currencies.map((currency, index) => (
                  <Bar
                    key={currency}
                    dataKey={currency}
                    name={currency}
                    fill={SERIES_FILLS[index % SERIES_FILLS.length]}
                    radius={[6, 6, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No paid bookings yet.</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border-border p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold">Best selling routes</h2>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.byRoute.map((row) => {
                  const route = routes.find((entry) => entry.slug === row.route_slug);
                  return (
                    <TableRow key={row.route_slug}>
                      <TableCell className="text-sm font-medium">
                        {route ? `${route.origin_city} → ${route.destination_city}` : row.route_slug}
                      </TableCell>
                      <TableCell className="text-sm">{row.tickets}</TableCell>
                      <TableCell className="text-right text-sm">{moneyLines(row.revenue)}</TableCell>
                    </TableRow>
                  );
                })}
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

        <Card className="rounded-3xl border-border p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold">Operator settlements</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Gross fares, the commission we keep, and what each operator is owed.
          </p>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.byOperator.map((row) => (
                  <TableRow key={row.operator_name}>
                    <TableCell className="text-sm font-medium">{row.operator_name || 'Unknown operator'}</TableCell>
                    <TableCell className="text-sm">{moneyLines(row.gross)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{moneyLines(row.fee)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {Object.entries(row.gross).map(([currency, gross]) => (
                        <p key={currency}>{formatMoney(gross - (row.fee[currency] || 0), currency)}</p>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
                {!state.byOperator.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      Nothing settled yet.
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
