import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { addDays, addMonths, format, parseISO, startOfMonth } from 'date-fns';
import { BadgeDollarSign, Download, Percent, Ticket, TrendingUp, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatCard from '@/components/manage/StatCard';
import { formatMoney } from '@/lib/format';

const SERIES_FILLS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

const PERIODS = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_90', label: 'Last 90 days' },
  { id: 'this_year', label: 'This year' },
  { id: 'all_time', label: 'All time' },
  { id: 'custom', label: 'Custom range' },
];

const CUSTOMER_FIELDS = [
  'booking_ref',
  'travel_date',
  'departure_time',
  'origin_city',
  'destination_city',
  'seats',
  'passengers',
  'passenger_count',
  'amount',
  'currency',
  'contact_name',
  'contact_email',
  'contact_phone',
  'paid_at',
];

function periodRange(period, custom) {
  const now = new Date();
  switch (period) {
    case 'this_month':
      return {
        $gte: format(startOfMonth(now), 'yyyy-MM-dd'),
        $lt: format(startOfMonth(addMonths(now, 1)), 'yyyy-MM-dd'),
      };
    case 'last_month': {
      const previous = addMonths(now, -1);
      return {
        $gte: format(startOfMonth(previous), 'yyyy-MM-dd'),
        $lt: format(startOfMonth(now), 'yyyy-MM-dd'),
      };
    }
    case 'last_90':
      return {
        $gte: format(addDays(now, -90), 'yyyy-MM-dd'),
        $lt: format(addDays(now, 1), 'yyyy-MM-dd'),
      };
    case 'this_year':
      return {
        $gte: `${now.getFullYear()}-01-01`,
        $lt: `${now.getFullYear() + 1}-01-01`,
      };
    case 'custom': {
      if (!custom.from) return null;
      const range = { $gte: custom.from };
      if (custom.to) range.$lt = format(addDays(parseISO(custom.to), 1), 'yyyy-MM-dd');
      return range;
    }
    default:
      return null;
  }
}

function baseQuery(operatorSlug, period, custom) {
  const query = { operator_slug: operatorSlug, status: 'paid' };
  const range = periodRange(period, custom);
  if (range) query.paid_at = range;
  return query;
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

function moneyLines(map) {
  return Object.entries(map).map(([currency, value]) => (
    <p key={currency}>{formatMoney(value, currency)}</p>
  ));
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function joinList(list) {
  if (!Array.isArray(list)) return '';
  return list
    .map((item) => (item && typeof item === 'object' ? item.name || '' : String(item)))
    .filter(Boolean)
    .join('; ');
}

const CSV_COLUMNS = [
  { label: 'booking_ref', value: (row) => row.booking_ref },
  { label: 'travel_date', value: (row) => row.travel_date },
  { label: 'departure_time', value: (row) => row.departure_time },
  { label: 'origin_city', value: (row) => row.origin_city },
  { label: 'destination_city', value: (row) => row.destination_city },
  { label: 'seats', value: (row) => joinList(row.seats) },
  { label: 'passengers', value: (row) => joinList(row.passengers) },
  { label: 'passenger_count', value: (row) => row.passenger_count },
  { label: 'amount', value: (row) => row.amount },
  { label: 'currency', value: (row) => row.currency || 'UGX' },
  { label: 'contact_name', value: (row) => row.contact_name },
  { label: 'contact_email', value: (row) => row.contact_email },
  { label: 'contact_phone', value: (row) => row.contact_phone },
  { label: 'paid_at', value: (row) => row.paid_at },
];

export default function OperatorReportsTab({ operator, routes = [] }) {
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [state, setState] = useState({
    loading: true,
    totals: [],
    currencies: [],
    byDate: [],
    byRoute: [],
    rows: [],
    capped: false,
  });

  const needsCustomDates = period === 'custom' && !custom.from;

  useEffect(() => {
    let active = true;

    if (needsCustomDates) {
      setState({ loading: false, totals: [], currencies: [], byDate: [], byRoute: [], rows: [], capped: false });
      return () => {
        active = false;
      };
    }

    (async () => {
      setState((prev) => ({ ...prev, loading: true }));

      const query = baseQuery(operator.slug, period, custom);
      const totals = await db.entities.Booking.aggregate({
        query,
        groupBy: 'currency',
        sum: ['amount', 'platform_fee', 'operator_net', 'passenger_count'],
      });
      const currencyRows = totals.rows || [];
      const currencies = [...new Set(currencyRows.map((row) => row.currency || 'UGX'))];

      const [dateAggs, routeAggs, bookings] = await Promise.all([
        Promise.all(
          currencies.map((currency) =>
            db.entities.Booking.aggregate({
              query: { ...query, currency },
              groupBy: 'travel_date',
              sum: ['amount'],
              sort: 'travel_date',
              limit: 31,
            })
          )
        ),
        Promise.all(
          currencies.map((currency) =>
            db.entities.Booking.aggregate({
              query: { ...query, currency },
              groupBy: 'route_slug',
              sum: ['amount', 'passenger_count'],
              sort: '-sum_amount',
              limit: 10,
            })
          )
        ),
        db.entities.Booking.filter(query, {
          sort: '-paid_at',
          limit: 1000,
          fields: CUSTOMER_FIELDS,
        }),
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
        .slice(-31);

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

      const rows = bookings.items || [];
      setState({
        loading: false,
        totals: currencyRows,
        currencies,
        byDate,
        byRoute,
        rows,
        capped: rows.length >= 1000,
      });
    })();

    return () => {
      active = false;
    };
  }, [operator.slug, period, custom.from, custom.to, needsCustomDates]);

  const customerMap = new Map();
  state.rows.forEach((row) => {
    const key = (row.contact_email || '').toLowerCase().trim() || 'unknown';
    const entry = customerMap.get(key) || {
      key,
      email: key === 'unknown' ? '' : key,
      name: '',
      bookings: 0,
      spend: {},
    };
    entry.bookings += 1;
    if (!entry.name && row.contact_name) entry.name = row.contact_name;
    const currency = row.currency || 'UGX';
    entry.spend[currency] = (entry.spend[currency] || 0) + (Number(row.amount) || 0);
    customerMap.set(key, entry);
  });
  const customers = [...customerMap.values()];
  const repeatCustomers = customers.filter((entry) => entry.bookings >= 2).length;
  const repeatRate = customers.length ? Math.round((repeatCustomers / customers.length) * 100) : 0;
  const topCustomers = [...customers].sort((a, b) => b.bookings - a.bookings).slice(0, 10);

  const fallbackCurrency = operator.currency || 'UGX';
  const splitRows = state.totals.map((row) => {
    const gross = Number(row.sum_amount) || 0;
    const fee = Number(row.sum_platform_fee) || 0;
    return {
      currency: row.currency || 'UGX',
      gross,
      fee,
      net: row.sum_operator_net ?? gross - fee,
    };
  });
  const tickets = state.totals.reduce((total, row) => total + (Number(row.sum_passenger_count) || 0), 0);
  const paidCount = state.totals.reduce((total, row) => total + (Number(row.count) || 0), 0);

  const exportCsv = () => {
    const lines = [CSV_COLUMNS.map((column) => csvEscape(column.label)).join(',')];
    state.rows.forEach((row) => {
      lines.push(CSV_COLUMNS.map((column) => csvEscape(column.value(row))).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reports-${operator.slug}-${period}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (state.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Period</p>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {period === 'custom' && (
            <>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">From</p>
                <Input
                  type="date"
                  value={custom.from}
                  onChange={(event) => setCustom({ ...custom, from: event.target.value })}
                  className="w-40"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">To</p>
                <Input
                  type="date"
                  value={custom.to}
                  onChange={(event) => setCustom({ ...custom, to: event.target.value })}
                  className="w-40"
                />
              </div>
            </>
          )}
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!state.rows.length}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {needsCustomDates ? (
        <Card className="rounded-3xl border-border p-10 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">Pick a start date to build the report.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Gross revenue"
              value={moneyValue(
                splitRows.map((row) => ({ currency: row.currency, value: row.gross })),
                fallbackCurrency
              )}
              hint={`${paidCount} paid booking${paidCount === 1 ? '' : 's'}`}
              icon={BadgeDollarSign}
            />
            <StatCard label="Tickets sold" value={tickets.toLocaleString('en-US')} icon={Ticket} />
            <StatCard
              label="Platform commission"
              value={moneyValue(
                splitRows.map((row) => ({ currency: row.currency, value: row.fee })),
                fallbackCurrency
              )}
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

          <Card className="rounded-3xl border-border p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <TrendingUp className="h-4 w-4 text-primary" /> Revenue by travel date
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
              <p className="mt-4 text-sm text-muted-foreground">No paid bookings in this period.</p>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-3xl border-border p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold">Top routes</h2>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Route</TableHead>
                      <TableHead>Tickets</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
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
                          Nothing sold in this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <Card className="rounded-3xl border-border p-6 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-bold">Customer analytics</h2>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{customers.length}</span> customer
                  {customers.length === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold text-foreground">{repeatRate}%</span> repeat rate
                </p>
              </div>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Trips</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topCustomers.map((entry) => (
                      <TableRow key={entry.key}>
                        <TableCell className="text-sm font-medium">
                          {entry.name || entry.email || 'No contact email'}
                          {entry.name && entry.email && (
                            <span className="block text-xs font-normal text-muted-foreground">{entry.email}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{entry.bookings}</TableCell>
                        <TableCell className="text-right text-sm">{moneyLines(entry.spend)}</TableCell>
                      </TableRow>
                    ))}
                    {!topCustomers.length && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-sm text-muted-foreground">
                          No bookings in this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {state.capped && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Based on the latest 1,000 bookings in this period.
                </p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
