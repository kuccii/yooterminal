import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';

import SearchForm from '@/components/SearchForm';
import TripCard from '@/components/TripCard';
import ResultsFilters from '@/components/ResultsFilters';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildTrips, heldSeatsByTrip, seatsLeft, SORT_OPTIONS, TIME_WINDOWS } from '@/lib/trips';
import { formatDateFull, todayISO } from '@/lib/format';

const EMPTY_FILTERS = { windows: [], operators: [], classes: [], maxPrice: null };

export default function SearchResults() {
  const [params] = useSearchParams();
  const fromSlug = params.get('from') || '';
  const toSlug = params.get('to') || '';
  const travelDate = params.get('date') || todayISO();
  const passengers = Number(params.get('passengers') || 1);
  const routeSlug = fromSlug && toSlug ? `${fromSlug}-${toSlug}` : '';

  const [route, setRoute] = useState(null);
  const [facets, setFacets] = useState({ operators: [], classes: [], price: null });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState('cheapest');
  const [trips, setTrips] = useState([]);
  const [held, setHeld] = useState({});
  const [operatorMap, setOperatorMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setSort('cheapest');
  }, [routeSlug]);

  useEffect(() => {
    if (!routeSlug) {
      setReady(true);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setReady(false);

    (async () => {
      const routePage = await db.entities.Route.filter({ slug: routeSlug }, { limit: 1 });
      const found = routePage.items?.[0] || null;
      if (!active) return;
      setRoute(found);

      if (!found) {
        setTrips([]);
        setReady(true);
        setLoading(false);
        return;
      }

      const timetablePage = await db.entities.Schedule.filter(
        { route_slug: routeSlug, active: true, operator_status: 'approved' },
        { limit: 100 }
      );
      if (!active) return;

      const timetable = timetablePage.items || [];
      const prices = timetable.map((item) => Number(item.price)).filter((value) => !Number.isNaN(value));
      setFacets({
        operators: [...new Set(timetable.map((item) => item.operator_name))].sort(),
        classes: [...new Set(timetable.map((item) => item.bus_class))].sort(),
        price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
      });
      setReady(true);
    })();

    return () => {
      active = false;
    };
  }, [routeSlug]);

  useEffect(() => {
    if (!ready || !route) return undefined;
    let active = true;
    setLoading(true);

    const query = { route_slug: routeSlug, active: true, operator_status: 'approved' };
    if (filters.operators.length) query.operator_name = { $in: filters.operators };
    if (filters.classes.length) query.bus_class = { $in: filters.classes };
    if (filters.maxPrice) query.price = { $lte: filters.maxPrice };
    if (filters.windows.length) {
      query.$or = filters.windows
        .map((id) => TIME_WINDOWS.find((window) => window.id === id))
        .filter(Boolean)
        .map((window) => ({ departure_time: { $gte: window.from, $lt: window.to } }));
    }
    const sortField = SORT_OPTIONS.find((option) => option.id === sort)?.field || 'price';

    (async () => {
      const page = await db.entities.Schedule.filter(query, { sort: sortField, limit: 100 });
      const list = buildTrips(page.items || [], travelDate);
      const keys = list.map((trip) => trip.key);
      const slugs = [...new Set(list.map((trip) => trip.schedule.operator_slug))];

      const [heldPage, operatorPage] = await Promise.all([
        keys.length
          ? db.entities.DepartureSeat.filter(
              { trip_key: { $in: keys } },
              { limit: 500, fields: ['trip_key', 'seats'] }
            )
          : Promise.resolve({ items: [] }),
        slugs.length
          ? db.entities.Operator.filter({ slug: { $in: slugs } }, { limit: 50 })
          : Promise.resolve({ items: [] }),
      ]);
      if (!active) return;

      setTrips(list);
      setHeld(heldSeatsByTrip(heldPage.items || []));
      setOperatorMap(Object.fromEntries((operatorPage.items || []).map((item) => [item.slug, item])));
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [ready, route, routeSlug, travelDate, filters, sort]);

  const clearFilters = () => setFilters(EMPTY_FILTERS);
  const currency = trips[0]?.schedule.currency || facets.price?.currency || 'UGX';

  return (
    <>
      <div className="border-b border-border bg-secondary/50 py-6">
        <div className="mx-auto max-w-6xl px-4">
          <SearchForm
            initialFrom={fromSlug}
            initialTo={toSlug}
            initialDate={travelDate}
            initialPassengers={passengers}
          />
          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              {route ? `${route.origin_city} → ${route.destination_city}` : 'Search buses'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDateFull(travelDate)} ·{' '}
              {loading ? 'searching…' : `${trips.length} ${trips.length === 1 ? 'departure' : 'departures'}`}
              {passengers > 1 && ` · ${passengers} passengers`}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <aside className="hidden md:block">
            <div className="sticky top-24">
              <ResultsFilters
                facets={facets}
                filters={filters}
                onChange={setFilters}
                onClear={clearFilters}
                currency={currency}
              />
            </div>
          </aside>

          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="rounded-xl md:hidden">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Filters
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[320px] overflow-y-auto p-4">
                    <ResultsFilters
                      facets={facets}
                      filters={filters}
                      onChange={setFilters}
                      onClear={clearFilters}
                      currency={currency}
                    />
                  </SheetContent>
                </Sheet>
                <p className="hidden text-sm text-muted-foreground sm:block">
                  {trips.length} {trips.length === 1 ? 'option' : 'options'} found
                </p>
              </div>

              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-[210px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading && (
              <div className="space-y-4">
                {[1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            )}

            {!loading && !routeSlug && <EmptyPanel title="Where would you like to go?" body="Search a route above to see every departure available." />}

            {!loading && routeSlug && !route && (
              <EmptyPanel
                title="We don't cover this route yet"
                body="Try one of our most popular routes instead."
              >
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    ['Kampala → Kigali', '/routes/kampala-kigali'],
                    ['Kampala → Mbarara', '/routes/kampala-mbarara'],
                    ['Kigali → Musanze', '/routes/kigali-musanze'],
                  ].map(([label, href]) => (
                    <Link key={href} to={href} className="rounded-full border border-border px-3 py-1.5 text-sm font-medium transition hover:border-primary hover:text-primary">
                      {label}
                    </Link>
                  ))}
                </div>
              </EmptyPanel>
            )}

            {!loading && route && !trips.length && (
              <EmptyPanel
                title="No departures match your filters"
                body="Try removing a filter or choosing another departure time."
              >
                <Button variant="outline" className="mt-4 rounded-xl" onClick={clearFilters}>
                  Clear all filters
                </Button>
              </EmptyPanel>
            )}

            <div className="space-y-4">
              {!loading &&
                trips.map((trip) => (
                  <TripCard
                    key={trip.key}
                    trip={trip}
                    passengers={passengers}
                    operator={operatorMap[trip.schedule.operator_slug]}
                    seatsAvailable={seatsLeft(trip, held)}
                  />
                ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function EmptyPanel({ title, body, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}