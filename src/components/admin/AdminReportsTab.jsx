import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { BadgeDollarSign, Bus, Percent, Ticket, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatCard from '@/components/manage/StatCard';
import { formatMoney } from '@/lib/format';

export default function AdminReportsTab({ operators, routes }) {
  const [state, setState] = useState({ loading: true, totals: null, byDate: [], byRoute: [], byOperator: [] });

  useEffect(() => {
    let active = true;

    (async () => {
      const [totals, byDate, byRoute, byOperator] = await Promise.all([
        db.entities.Booking.aggregate({
          query: { status: 'paid' },
          sum: ['amount', 'platform_fee', 'passenger_count'],
          avg: 'amount',
        }),
        db.entities.Booking.aggregate({
          query: { status: 'paid' },
          groupBy: 'travel_date',
          sum: ['amount', 'passenger_count'],
          sort: 'travel_date',
          limit: 30,
        }),
        db.entities.Booking.aggregate({
          query: { status: 'paid' },
          groupBy: 'route_slug',
          sum: ['amount', 'passenger_count'],
          sort: '-sum_amount',
          limit: 10,
        }),
        db.entities.Booking.aggregate({
          query: { status: 'paid' },
          groupBy: 'operator_name',
          sum: ['amount', 'platform_fee', 'passenger_count'],
          sort: '-sum_amount',
          limit: 20,
        }),
      ]);
      if (!active) return;
      setState({
        loading: false,
        totals: totals.rows?.[0] || null,
        byDate: (byDate.rows || []).slice(-14),
        byRoute: byRoute.rows || [],
        byOperator: byOperator.rows || [],
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

  const totals = state.totals || {};
  const pending = operators.filter((operator) => (operator.status || 'pending') !== 'approved').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tickets sold" value={(totals.sum_passenger_count || 0).toLocaleString('en-US')} icon={Ticket} />
        <StatCard
          label="Gross booking value"
          value={formatMoney(totals.sum_amount || 0, 'UGX')}
          hint="Fares in UGX, RWF and USD are combined into one platform view."
          icon={BadgeDollarSign}
        />
        <StatCard
          label="Commission earned"
          value={formatMoney(totals.sum_platform_fee || 0, 'UGX')}
          hint={`${totals.count || 0} paid bookings`}
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
                  formatter={(value, name) => [value, name === 'sum_amount' ? 'Booked value' : name]}
                  contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))' }}
                />
                <Bar dataKey="sum_amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
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
                      <TableCell className="text-sm">{row.sum_passenger_count || 0}</TableCell>
                      <TableCell className="text-right text-sm">{formatMoney(row.sum_amount || 0, route?.currency || 'UGX')}</TableCell>
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
                    <TableCell className="text-sm font-medium">{row.operator_name}</TableCell>
                    <TableCell className="text-sm">{formatMoney(row.sum_amount || 0, 'UGX')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatMoney(row.sum_platform_fee || 0, 'UGX')}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {formatMoney((row.sum_amount || 0) - (row.sum_platform_fee || 0), 'UGX')}
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