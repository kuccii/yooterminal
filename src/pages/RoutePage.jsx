import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Clock, Flag, MapPin } from 'lucide-react';

import SearchForm from '@/components/SearchForm';
import TripCard from '@/components/TripCard';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Image } from '@/components/ui/image';
import { Skeleton } from '@/components/ui/skeleton';
import { buildTrips, heldSeatsByTrip, seatsLeft, withBlockedSeats } from '@/lib/trips';
import { formatDuration, formatMoney, todayISO } from '@/lib/format';
import { IMAGES } from '@/lib/images';

export default function RoutePage() {
  const { slug = '' } = useParams();
  const travelDate = todayISO();
  const [state, setState] = useState({
    loading: true,
    route: null,
    trips: [],
    held: {},
    operators: {},
    otherRoutes: [],
  });

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true }));

    (async () => {
      const routePage = await db.entities.Route.filter({ slug }, { limit: 1 });
      const route = routePage.items?.[0] || null;
      if (!route) {
        if (active) setState({ loading: false, route: null, trips: [], held: {}, operators: {}, otherRoutes: [] });
        return;
      }

      const [schedulePage, otherPage] = await Promise.all([
        db.entities.Schedule.filter(
          { route_slug: slug, active: true, operator_status: 'approved' },
          { sort: 'departure_time', limit: 100 }
        ),
        db.entities.Route.filter({ origin_slug: route.origin_slug, popular: true }, { limit: 6 }),
      ]);

      const trips = buildTrips(schedulePage.items || [], travelDate);
      const keys = trips.map((trip) => trip.key);
      const slugs = [...new Set(trips.map((trip) => trip.schedule.operator_slug))];

      const [heldPage, blockedPage, operatorPage] = await Promise.all([
        keys.length
          ? db.entities.DepartureSeat.filter({ trip_key: { $in: keys } }, { limit: 500, fields: ['trip_key', 'seats'] })
          : Promise.resolve({ items: [] }),
        keys.length
          ? db.entities.BlockedSeat.filter(
              { trip_key: { $in: keys } },
              { limit: 500, fields: ['trip_key', 'seat_label'] }
            )
          : Promise.resolve({ items: [] }),
        slugs.length
          ? db.entities.Operator.filter({ slug: { $in: slugs } }, { limit: 50 })
          : Promise.resolve({ items: [] }),
      ]);
      if (!active) return;

      setState({
        loading: false,
        route,
        trips,
        held: withBlockedSeats(heldSeatsByTrip(heldPage.items || []), blockedPage.items),
        operators: Object.fromEntries((operatorPage.items || []).map((operator) => [operator.slug, operator])),
        otherRoutes: (otherPage.items || []).filter((item) => item.slug !== slug),
      });
    })();

    return () => {
      active = false;
    };
  }, [slug, travelDate]);

  if (state.loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="mt-6 h-64 w-full rounded-3xl" />
      </div>
    );
  }

  if (!state.route) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold">We don&apos;t cover that route yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">Search from the home page to see every route we compare.</p>
      </div>
    );
  }

  const { route, trips, held, operators, otherRoutes } = state;
  const currency = trips[0]?.schedule.currency || route.currency;
  const cheapest = trips.reduce((best, trip) => (!best || trip.schedule.price < best.schedule.price ? trip : best), null);

  const faqs = [
    {
      q: `How much is a bus ticket from ${route.origin_city} to ${route.destination_city}?`,
      a: `Fares start at ${formatMoney(route.from_price, currency)} per passenger. Prices rise closer to departure, so book a few days in advance for the best rate.`,
    },
    {
      q: `How long does the bus from ${route.origin_city} to ${route.destination_city} take?`,
      a: `The journey takes about ${formatDuration(route.duration_minutes)} over roughly ${route.distance_km} km, depending on traffic and stops.`,
    },
    {
      q: `How many buses run from ${route.origin_city} to ${route.destination_city} each day?`,
      a: `We compare ${trips.length} departure${trips.length === 1 ? '' : 's'} today from ${new Set(trips.map((trip) => trip.schedule.operator_name)).size} operator${new Set(trips.map((trip) => trip.schedule.operator_name)).size === 1 ? '' : 's'}.`,
    },
    {
      q: 'When is the cheapest time to travel?',
      a: cheapest
        ? `The ${cheapest.departureLabel} departure with ${cheapest.schedule.operator_name} is the cheapest today at ${formatMoney(cheapest.schedule.price, cheapest.schedule.currency)}. Midweek departures are usually the best value.`
        : 'Midweek departures are usually the cheapest.',
    },
  ];

  if (route.crossing_border) {
    faqs.push({
      q: 'Do I need a passport for this cross-border route?',
      a: 'Yes. This coach crosses between Uganda and Rwanda, so carry a valid passport or East African Community ID. Expect a border stop of around 45 minutes at Gatuna/Katuna.',
    });
  }

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <Image
          src={route.image_url || IMAGES.busRoad}
          alt={`Bus from ${route.origin_city} to ${route.destination_city}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-foreground/65" />
        <div className="relative mx-auto max-w-6xl px-4 py-14">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-white/15 text-white hover:bg-white/15">Bus route</Badge>
            {route.crossing_border && (
              <Badge className="rounded-full bg-white/15 text-white hover:bg-white/15">
                <Flag className="mr-1 h-3 w-3" /> Cross-border
              </Badge>
            )}
          </div>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Buses from {route.origin_city} to {route.destination_city}
          </h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/80">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {formatDuration(route.duration_minutes)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {route.distance_km} km
            </span>
            <span>from {formatMoney(route.from_price, currency)}</span>
          </p>
          <p className="mt-3 max-w-2xl text-sm text-white/80">{route.description}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <SearchForm
          initialFrom={route.origin_slug}
          initialTo={route.destination_slug}
          initialDate={travelDate}
          initialPassengers={1}
        />

        <h2 className="mt-10 font-display text-2xl font-extrabold tracking-tight">Timetable and fares</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Today&apos;s departures · {trips.length} {trips.length === 1 ? 'bus' : 'buses'} available
        </p>

        <div className="mt-6 space-y-4">
          {trips.length ? (
            trips.map((trip) => (
              <TripCard
                key={trip.key}
                trip={trip}
                operator={operators[trip.schedule.operator_slug]}
                seatsAvailable={seatsLeft(trip, held)}
              />
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No departures listed right now. Search a future date to see the full timetable.
            </p>
          )}
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-tight">
              About the {route.origin_city} → {route.destination_city} route
            </h2>
            <Accordion type="single" collapsible className="mt-4">
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.q} value={`route-faq-${index}`} className="border-border">
                  <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {otherRoutes.length > 0 && (
            <div>
              <h2 className="font-display text-xl font-extrabold tracking-tight">
                Other popular routes from {route.origin_city}
              </h2>
              <div className="mt-4 space-y-3">
                {otherRoutes.map((other) => (
                  <Link
                    key={other.slug}
                    to={`/routes/${other.slug}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span>
                      <span className="flex items-center gap-1.5 font-display text-base font-bold">
                        {other.origin_city}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        {other.destination_city}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDuration(other.duration_minutes)}</span>
                    </span>
                    <span className="text-sm font-semibold text-primary">from {formatMoney(other.from_price, other.currency)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}