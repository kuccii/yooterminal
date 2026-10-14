import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, MapPin, Phone, Bus as BusIcon } from 'lucide-react';

import OperatorAvatar from '@/components/OperatorAvatar';
import SearchForm from '@/components/SearchForm';
import Stars from '@/components/Stars';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration, formatMoney, todayISO } from '@/lib/format';

export default function OperatorPage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState({ loading: true, operator: null, routes: [], reviews: [] });

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true }));

    (async () => {
      const operatorPage = await db.entities.Operator
        .filter({ slug, status: 'approved' }, { limit: 1 })
        .catch(() => ({ items: [] }));
      const operator = operatorPage.items?.[0] || null;
      if (!operator) {
        if (active) setState({ loading: false, operator: null, routes: [], reviews: [] });
        return;
      }

      const [schedulePage, reviewPage] = await Promise.all([
        db.entities.Schedule
          .filter({ operator_slug: slug, active: true, operator_status: 'approved' }, { limit: 200, fields: ['route_slug'] })
          .catch(() => ({ items: [] })),
        db.entities.Review
          .filter({ operator_slug: slug, status: 'published' }, { sort: '-created_date', limit: 20 })
          .catch(() => ({ items: [] })),
      ]);

      const routeSlugs = [...new Set((schedulePage.items || []).map((item) => item.route_slug).filter(Boolean))];
      const routePage = routeSlugs.length
        ? await db.entities.Route.filter({ slug: { $in: routeSlugs } }, { limit: 50 }).catch(() => ({ items: [] }))
        : { items: [] };

      if (!active) return;
      setState({
        loading: false,
        operator,
        routes: routePage.items || [],
        reviews: reviewPage.items || [],
      });
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  if (state.loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="mt-6 h-64 w-full rounded-3xl" />
      </div>
    );
  }

  if (!state.operator) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold">We couldn&apos;t find that operator</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The company may not be approved yet, or the link is out of date.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">
          Back to search
        </Link>
      </div>
    );
  }

  const { operator, routes, reviews } = state;

  return (
    <>
      <section className="border-b border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex flex-wrap items-start gap-5">
            <OperatorAvatar name={operator.name} color={operator.brand_color} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl font-extrabold tracking-tight">{operator.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> {operator.country}
                </span>
                {operator.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-4 w-4" /> {operator.phone}
                  </span>
                )}
                {operator.fleet && (
                  <span className="flex items-center gap-1">
                    <BusIcon className="h-4 w-4" /> {operator.fleet}
                  </span>
                )}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Stars rating={operator.rating} size="lg" />
                <span className="text-sm text-muted-foreground">
                  {Number(operator.rating || 0).toFixed(1)} from {operator.review_count || 0} reviews
                </span>
              </div>
              {operator.description && (
                <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{operator.description}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-12">
        <section>
          <h2 className="font-display text-xl font-extrabold tracking-tight">Routes {operator.name} runs</h2>
          {routes.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {routes.map((route) => (
                <Link
                  key={route.slug}
                  to={`/routes/${route.slug}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span>
                    <span className="font-display text-base font-bold">
                      {route.origin_city} → {route.destination_city}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDuration(route.duration_minutes)}
                      {route.crossing_border && ' · Cross-border'}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-primary">from {formatMoney(route.from_price, route.currency)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No departures on sale right now — check back soon.
            </p>
          )}
        </section>

        <section>
          <h2 className="font-display text-xl font-extrabold tracking-tight">Traveller reviews</h2>
          {reviews.length ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-display text-sm font-bold">{review.author_name || 'Traveller'}</p>
                    <Stars rating={review.rating} />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
                  {(review.route_label || review.travel_date) && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {[review.route_label, review.travel_date].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No reviews yet for this operator.
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <h2 className="font-display text-xl font-extrabold tracking-tight">Travel with {operator.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick your cities and date to see every departure.</p>
          <div className="mt-5">
            <SearchForm initialDate={todayISO()} initialPassengers={1} />
          </div>
          <Link to="/search" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Browse all routes <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>
    </>
  );
}
