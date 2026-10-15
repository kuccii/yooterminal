import db from '@/api/client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeDollarSign, ChevronDown, ChevronUp, Download, Percent, Repeat, Search, Users, UsersRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatCard from '@/components/manage/StatCard';
import { downloadCsv } from '@/lib/csv';
import { formatMoney } from '@/lib/format';

const HYDRATE_FIELDS = [
  'contact_email',
  'contact_name',
  'contact_phone',
  'amount',
  'currency',
  'paid_at',
  'travel_date',
  'route_slug',
  'origin_city',
  'destination_city',
  'booking_ref',
  'passenger_count',
];

const PAGE_SIZE = 200;
const RECENT_LIMIT = 5;
const HYDRATE_LIMIT = 1000;

function customerKey(row) {
  return (row.contact_email || '').toLowerCase().trim() || 'unknown';
}

function routeLabel(row) {
  if (row.origin_city && row.destination_city) return `${row.origin_city} → ${row.destination_city}`;
  return (row.route_slug || '').replace(/-/g, ' → ');
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

export default function OperatorCustomersTab({ operator }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    customers: [],
    currencies: [],
    totals: [],
    paidCount: 0,
    hydrateCapped: false,
  });
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState('');
  const tokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = ++tokenRef.current;
    setState((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      const query = { operator_slug: operator.slug, status: 'paid' };
      const totals = await db.entities.Booking.aggregate({
        query,
        groupBy: 'currency',
        sum: ['amount', 'passenger_count'],
      });
      const currencyRows = totals.rows || [];
      const rawCurrencies = currencyRows.map((row) => row.currency ?? null);

      const [aggregates, bookings] = await Promise.all([
        Promise.all(
          rawCurrencies.map((currency) =>
            db.entities.Booking.aggregate({
              query: { ...query, currency },
              groupBy: 'contact_email',
              sum: ['amount', 'passenger_count'],
              sort: '-sum_amount',
            })
          )
        ),
        db.entities.Booking.filter(query, {
          sort: '-paid_at',
          limit: HYDRATE_LIMIT,
          fields: HYDRATE_FIELDS,
        }),
      ]);
      if (tokenRef.current !== token) return;

      const customers = new Map();
      aggregates.forEach((aggregate, index) => {
        const currency = rawCurrencies[index] || 'UGX';
        (aggregate.rows || []).forEach((row) => {
          const key = customerKey(row);
          const entry = customers.get(key) || {
            key,
            email: key === 'unknown' ? '' : key,
            name: '',
            phone: '',
            trips: 0,
            tickets: 0,
            spend: {},
            latestTrip: '',
            routes: {},
            recent: [],
          };
          entry.trips += Number(row.count) || 0;
          entry.tickets += Number(row.sum_passenger_count) || 0;
          entry.spend[currency] = (entry.spend[currency] || 0) + (Number(row.sum_amount) || 0);
          customers.set(key, entry);
        });
      });

      const hydrated = bookings.items || [];
      hydrated.forEach((row) => {
        const entry = customers.get(customerKey(row));
        if (!entry) return;
        if (!entry.name && row.contact_name) entry.name = row.contact_name;
        if (!entry.phone && row.contact_phone) entry.phone = row.contact_phone;
        if (row.travel_date && row.travel_date > entry.latestTrip) entry.latestTrip = row.travel_date;
        const slug = row.route_slug || '';
        if (slug) {
          const route = entry.routes[slug] || { count: 0, label: routeLabel(row) };
          route.count += 1;
          entry.routes[slug] = route;
        }
        if (entry.recent.length < RECENT_LIMIT) {
          entry.recent.push({
            booking_ref: row.booking_ref,
            travel_date: row.travel_date,
            route: routeLabel(row),
            amount: row.amount,
            currency: row.currency || 'UGX',
          });
        }
      });

      const rankedCurrency = [...currencyRows].sort(
        (a, b) => (Number(b.sum_amount) || 0) - (Number(a.sum_amount) || 0)
      )[0];
      const primaryCurrency = (rankedCurrency && rankedCurrency.currency) || 'UGX';

      const list = [...customers.values()].map((entry) => {
        const routes = Object.values(entry.routes).sort((a, b) => b.count - a.count);
        return { ...entry, topRoute: routes[0] ? routes[0].label : '' };
      });
      list.sort(
        (a, b) =>
          (b.spend[primaryCurrency] || 0) - (a.spend[primaryCurrency] || 0) ||
          b.trips - a.trips ||
          a.key.localeCompare(b.key)
      );

      const gross = new Map();
      currencyRows.forEach((row) => {
        const currency = row.currency || 'UGX';
        gross.set(currency, (gross.get(currency) || 0) + (Number(row.sum_amount) || 0));
      });

      setState({
        loading: false,
        error: '',
        customers: list,
        currencies: [...new Set(currencyRows.map((row) => row.currency || 'UGX'))],
        totals: [...gross.entries()].map(([currency, value]) => ({ currency, value })),
        paidCount: currencyRows.reduce((total, row) => total + (Number(row.count) || 0), 0),
        hydrateCapped: hydrated.length >= HYDRATE_LIMIT,
      });
    } catch (error) {
      if (tokenRef.current !== token) return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (error && error.message) || 'Could not load customers.',
      }));
    }
  }, [operator.slug]);

  useEffect(() => {
    setSearch('');
    setExpanded('');
    setVisible(PAGE_SIZE);
    load();
  }, [load]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return state.customers;
    return state.customers.filter(
      (entry) =>
        (entry.name || '').toLowerCase().includes(term) ||
        (entry.email || '').toLowerCase().includes(term) ||
        (entry.phone || '').toLowerCase().includes(term)
    );
  }, [state.customers, term]);
  const shown = filtered.slice(0, visible);

  if (state.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
    );
  }

  if (state.error) {
    return (
      <Card className="rounded-3xl border-border p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-destructive">{state.error}</p>
        <Button variant="outline" className="mt-4" onClick={load}>
          Try again
        </Button>
      </Card>
    );
  }

  if (!state.customers.length) {
    return (
      <Card className="rounded-3xl border-border p-10 text-center shadow-sm">
        <UsersRound className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-4 font-display text-xl font-extrabold">No customers yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Your customer database builds itself from paid tickets — every booking adds the traveller with their trips and
          spend. Sell a ticket and they show up here.
        </p>
      </Card>
    );
  }

  const unique = state.customers.length;
  const repeat = state.customers.filter((entry) => entry.trips >= 2).length;
  const repeatRate = unique ? Math.round((repeat / unique) * 100) : 0;
  const fallbackCurrency = operator.currency || 'UGX';
  const averages = state.totals.map((entry) => ({
    currency: entry.currency,
    value: unique ? Math.round(entry.value / unique) : 0,
  }));
  const countLine = term
    ? `${filtered.length.toLocaleString('en-US')} of ${unique.toLocaleString('en-US')} customers match “${search.trim()}”`
    : `${unique.toLocaleString('en-US')} customers from ${state.paidCount.toLocaleString('en-US')} paid booking${
        state.paidCount === 1 ? '' : 's'
      } · ranked by total spend`;

  const toggleExpanded = (key) => setExpanded((current) => (current === key ? '' : key));

  const exportCsv = () => {
    const columns = [
      { label: 'name', value: (row) => row.name },
      { label: 'email', value: (row) => row.email },
      { label: 'phone', value: (row) => row.phone },
      { label: 'trips', value: (row) => row.trips },
      { label: 'passengers', value: (row) => row.tickets },
      ...state.currencies.map((currency) => ({
        label: `spend_${currency}`,
        value: (row) => row.spend[currency] || 0,
      })),
      { label: 'latest_trip', value: (row) => row.latestTrip },
      { label: 'top_route', value: (row) => row.topRoute },
    ];
    downloadCsv(`customers-${operator.slug}.csv`, columns, filtered);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Unique customers"
          value={unique.toLocaleString('en-US')}
          hint={`${state.paidCount.toLocaleString('en-US')} paid booking${state.paidCount === 1 ? '' : 's'}`}
          icon={Users}
        />
        <StatCard
          label="Repeat customers"
          value={repeat.toLocaleString('en-US')}
          hint="Booked 2 or more trips"
          icon={Repeat}
        />
        <StatCard
          label="Repeat rate"
          value={`${repeatRate}%`}
          hint="Share who book again"
          icon={Percent}
        />
        <StatCard
          label="Average spend"
          value={moneyValue(averages, fallbackCurrency)}
          hint="Per customer, all time"
          icon={BadgeDollarSign}
        />
      </div>

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <UsersRound className="h-4 w-4 text-primary" /> Customers
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{countLine}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisible(PAGE_SIZE);
                }}
                placeholder="Search name, email or phone…"
                aria-label="Search customers"
                className="w-64 pl-9"
              />
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Trips</TableHead>
                <TableHead className="text-right">Total spend</TableHead>
                <TableHead>Latest trip</TableHead>
                <TableHead>Most-traveled route</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Recent bookings</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((entry) => (
                <React.Fragment key={entry.key}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggleExpanded(entry.key)}
                  >
                    <TableCell className="text-sm font-medium">
                      {entry.name || entry.email || 'No contact email'}
                      {entry.name && entry.email && (
                        <span className="block text-xs font-normal text-muted-foreground">{entry.email}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{entry.phone || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {entry.trips}
                      {entry.tickets > 0 && entry.tickets !== entry.trips && (
                        <span className="block text-xs text-muted-foreground">{entry.tickets} passengers</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">{moneyLines(entry.spend)}</TableCell>
                    <TableCell className="text-sm">{entry.latestTrip || '—'}</TableCell>
                    <TableCell className="text-sm">{entry.topRoute || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-expanded={expanded === entry.key}
                        aria-label={
                          expanded === entry.key ? 'Hide recent bookings' : 'Show recent bookings'
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpanded(entry.key);
                        }}
                      >
                        {expanded === entry.key ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded === entry.key && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="rounded-2xl border border-border bg-muted/40 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Recent bookings
                          </p>
                          {entry.recent.length ? (
                            <div className="mt-3 space-y-2">
                              {entry.recent.map((booking) => (
                                <div
                                  key={booking.booking_ref}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
                                >
                                  <div>
                                    <p className="font-mono text-xs font-bold tracking-widest">
                                      {booking.booking_ref}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {booking.travel_date} · {booking.route}
                                    </p>
                                  </div>
                                  <p className="text-sm font-semibold">
                                    {formatMoney(booking.amount, booking.currency)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-muted-foreground">
                              No recent trips loaded for this customer — the totals above are still complete.
                            </p>
                          )}
                          {entry.trips > entry.recent.length && (
                            <p className="mt-3 text-xs text-muted-foreground">
                              Showing the {entry.recent.length} most recent of {entry.trips} trips.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
              {!shown.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No customers match “{search.trim()}”.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {filtered.length > shown.length && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Showing {shown.length.toLocaleString('en-US')} of{' '}
              {filtered.length.toLocaleString('en-US')} customers
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisible((count) => count + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, filtered.length - shown.length)} more
            </Button>
          </div>
        )}

        {state.hydrateCapped && (
          <p className="mt-4 text-xs text-muted-foreground">
            Names, phone numbers, latest trips and route history are built from your latest 1,000 paid bookings — spend
            and trip totals above are complete.
          </p>
        )}
      </Card>
    </div>
  );
}
