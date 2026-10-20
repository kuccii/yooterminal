import db from '@/api/client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { StatusPill } from '@/components/ReportDrilldown';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadCsv, joinList } from '@/lib/csv';
import { formatMoney } from '@/lib/format';

const FIELDS = [
  'booking_ref',
  'status',
  'route_slug',
  'travel_date',
  'departure_time',
  'origin_city',
  'destination_city',
  'operator_name',
  'operator_slug',
  'seats',
  'passengers',
  'passenger_count',
  'contact_name',
  'contact_email',
  'contact_phone',
  'amount',
  'currency',
  'platform_fee',
  'paid_at',
  'created_date',
];

const STATUS_OPTIONS = [
  { id: 'all', label: 'All statuses' },
  { id: 'paid', label: 'Paid' },
  { id: 'pending', label: 'Pending' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'refunded', label: 'Refunded' },
];

const PIE_FILLS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const CSV_COLUMNS = [
  { label: 'booking_ref', value: (row) => row.booking_ref },
  { label: 'passenger', value: (row) => joinList(row.passengers) || row.contact_name || '' },
  { label: 'contact_name', value: (row) => row.contact_name },
  { label: 'contact_email', value: (row) => row.contact_email },
  { label: 'contact_phone', value: (row) => row.contact_phone },
  { label: 'route', value: (row) => `${row.origin_city || ''} to ${row.destination_city || ''}`.trim() },
  { label: 'operator', value: (row) => row.operator_name },
  { label: 'travel_date', value: (row) => row.travel_date },
  { label: 'departure_time', value: (row) => row.departure_time },
  { label: 'seats', value: (row) => joinList(row.seats) },
  { label: 'tickets', value: (row) => row.passenger_count || (row.seats || []).length },
  { label: 'amount', value: (row) => row.amount },
  { label: 'currency', value: (row) => row.currency || 'UGX' },
  { label: 'commission', value: (row) => row.platform_fee },
  { label: 'status', value: (row) => row.status },
];

function passengerName(row) {
  return joinList(row.passengers) || row.contact_name || 'Guest';
}

function routeName(row, routes) {
  const route = routes.find((entry) => entry.slug === row.route_slug);
  if (route) return `${route.origin_city} → ${route.destination_city}`;
  if (row.origin_city || row.destination_city) return `${row.origin_city || '—'} → ${row.destination_city || '—'}`;
  return row.route_slug || '—';
}

function ticketsOf(row) {
  return Number(row.passenger_count) || (Array.isArray(row.seats) ? row.seats.length : 0);
}

function sumByCurrency(rows, key) {
  const map = {};
  rows.forEach((row) => {
    const currency = row.currency || 'UGX';
    map[currency] = (map[currency] || 0) + (Number(row[key]) || 0);
  });
  return map;
}

function MoneyLines({ map }) {
  const entries = Object.entries(map);
  if (!entries.length) return <span>—</span>;
  return (
    <span className="flex flex-col leading-tight">
      {entries.map(([currency, value]) => (
        <span key={currency}>{formatMoney(value, currency)}</span>
      ))}
    </span>
  );
}

function CountChart({ title, data, dataKey, nameKey, layout = 'horizontal' }) {
  if (!data.length) {
    return (
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h3 className="font-display text-base font-bold">{title}</h3>
        <p className="mt-3 text-sm text-muted-foreground">Nothing to chart yet.</p>
      </Card>
    );
  }
  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <h3 className="font-display text-base font-bold">{title}</h3>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={layout}>
            <XAxis
              type={layout === 'vertical' ? 'number' : 'category'}
              dataKey={layout === 'vertical' ? undefined : nameKey}
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              type={layout === 'vertical' ? 'category' : 'number'}
              dataKey={layout === 'vertical' ? nameKey : undefined}
              width={layout === 'vertical' ? 110 : 36}
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))' }} />
            <Bar dataKey={dataKey} fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SharePie({ title, data }) {
  if (!data.length) {
    return (
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <h3 className="font-display text-base font-bold">{title}</h3>
        <p className="mt-3 text-sm text-muted-foreground">Nothing to chart yet.</p>
      </Card>
    );
  }
  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <h3 className="font-display text-base font-bold">{title}</h3>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={88} paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_FILLS[index % PIE_FILLS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))' }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export default function PassengerReport({ query = {}, routes = [], showOperator = false, csvName = 'passenger-report' }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const queryKey = JSON.stringify(query || {});

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    (async () => {
      try {
        const page = await db.entities.Booking.filter(query, { sort: '-created_date', limit: 1000, fields: FIELDS });
        if (!active) return;
        const rows = page.items || [];
        setState({ loading: false, error: '', rows });
      } catch (error) {
        if (active) setState({ loading: false, rows: [], error: error.message });
      }
    })();
    return () => {
      active = false;
    };
  }, [queryKey]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return state.rows.filter((row) => {
      if (status !== 'all' && (row.status || 'pending') !== status) return false;
      if (!needle) return true;
      const haystack = [
        row.booking_ref,
        passengerName(row),
        row.contact_name,
        row.contact_email,
        row.contact_phone,
        row.operator_name,
        row.route_slug,
        row.origin_city,
        row.destination_city,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [state.rows, search, status]);

  const paidRows = useMemo(() => filtered.filter((row) => row.status === 'paid'), [filtered]);
  const tickets = filtered.reduce((total, row) => total + ticketsOf(row), 0);
  const gross = sumByCurrency(paidRows, 'amount');
  const commission = sumByCurrency(paidRows, 'platform_fee');

  const byRoute = useMemo(() => {
    const map = new Map();
    paidRows.forEach((row) => {
      const key = routeName(row, routes);
      const entry = map.get(key) || { name: key, value: 0 };
      entry.value += ticketsOf(row);
      map.set(key, entry);
    });
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [paidRows, routes]);

  const byStatus = useMemo(() => {
    const map = new Map();
    filtered.forEach((row) => {
      const key = row.status || 'pending';
      const entry = map.get(key) || { name: key, value: 0 };
      entry.value += 1;
      map.set(key, entry);
    });
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [filtered]);

  const byOperator = useMemo(() => {
    const map = new Map();
    paidRows.forEach((row) => {
      const key = row.operator_name || row.operator_slug || 'Unknown';
      const entry = map.get(key) || { name: key, value: 0 };
      entry.value += ticketsOf(row);
      map.set(key, entry);
    });
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [paidRows]);

  const exportCsv = () => {
    downloadCsv(`${csvName}.csv`, CSV_COLUMNS, filtered);
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Passenger report</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Every passenger, seat, fare and status for this scope. Based on the latest 1,000 bookings.
            </p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search passenger, phone, ref, route…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-5 overflow-x-auto">
          {state.loading ? (
            <Skeleton className="h-56 w-full rounded-2xl" />
          ) : state.error ? (
            <p className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{state.error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Passenger</TableHead>
                  <TableHead>Route</TableHead>
                  {showOperator && <TableHead>Operator</TableHead>}
                  <TableHead>Travel</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row, index) => (
                  <TableRow key={row.id || `${row.booking_ref}-${index}`}>
                    <TableCell className="text-sm">
                      <p className="font-medium">{passengerName(row)}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.contact_phone || row.contact_email || row.booking_ref}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{routeName(row, routes)}</TableCell>
                    {showOperator && <TableCell className="text-sm">{row.operator_name || '—'}</TableCell>}
                    <TableCell className="text-sm">
                      {row.travel_date}
                      {row.departure_time ? ` · ${row.departure_time}` : ''}
                    </TableCell>
                    <TableCell className="text-sm">{joinList(row.seats) || '—'}</TableCell>
                    <TableCell className="text-right text-sm">{ticketsOf(row)}</TableCell>
                    <TableCell className="text-right text-sm">{formatMoney(row.amount, row.currency)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatMoney(row.platform_fee, row.currency)}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={showOperator ? 9 : 8} className="text-sm text-muted-foreground">
                      No bookings match this filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {filtered.length > 0 && (
                <tfoot>
                  <TableRow className="border-t border-border">
                    <TableCell className="text-sm font-semibold">Totals</TableCell>
                    <TableCell colSpan={showOperator ? 3 : 2} />
                    <TableCell />
                    <TableCell className="text-right text-sm font-semibold">{tickets}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      <MoneyLines map={gross} />
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      <MoneyLines map={commission} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">Paid only</TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <CountChart title="Tickets by route" data={byRoute} dataKey="value" nameKey="name" layout="vertical" />
        <SharePie title="Bookings by status" data={byStatus} />
        {showOperator && <SharePie title="Tickets by operator" data={byOperator} />}
      </div>
    </div>
  );
}
