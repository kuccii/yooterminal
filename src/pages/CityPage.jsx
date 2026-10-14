import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';

import SearchForm from '@/components/SearchForm';
import { Image } from '@/components/ui/image';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration, formatMoney, todayISO } from '@/lib/format';
import { IMAGES } from '@/lib/images';

function RouteList({ title, routes }) {
  if (!routes.length) return null;
  return (
    <div>
      <h2 className="font-display text-xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {routes.map((route) => (
          <Link
            key={route.slug}
            to={`/routes/${route.slug}`}
            className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span>
              <span className="flex items-center gap-1.5 font-display text-base font-bold">
                {route.origin_city}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                {route.destination_city}
              </span>
              <span className="text-xs text-muted-foreground">{formatDuration(route.duration_minutes)}</span>
            </span>
            <span className="text-sm font-semibold text-primary">from {formatMoney(route.from_price, route.currency)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function CityPage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState({ loading: true, city: null, from: [], to: [] });

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true }));

    (async () => {
      const cityPage = await db.entities.City.filter({ slug }, { limit: 1 });
      const city = cityPage.items?.[0] || null;
      if (!city) {
        if (active) setState({ loading: false, city: null, from: [], to: [] });
        return;
      }
      const [fromPage, toPage] = await Promise.all([
        db.entities.Route.filter({ origin_slug: slug }, { sort: 'from_price', limit: 30 }),
        db.entities.Route.filter({ destination_slug: slug }, { sort: 'from_price', limit: 30 }),
      ]);
      if (!active) return;
      setState({ loading: false, city, from: fromPage.items || [], to: toPage.items || [] });
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  if (state.loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="mt-6 h-64 w-full rounded-3xl" />
      </div>
    );
  }

  if (!state.city) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold">We don&apos;t serve that city yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">Browse the cities we cover across Uganda and Rwanda.</p>
        <Link to="/places" className="mt-6 inline-block font-semibold text-primary hover:underline">
          See all places
        </Link>
      </div>
    );
  }

  const { city, from, to } = state;
  const featured = city.featured || from.slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="relative overflow-hidden rounded-3xl border border-border">
        <Image
          src={city.image_url || IMAGES.busPark}
          alt={city.name}
          className="h-56 w-full object-cover md:h-64"
        />
        <div className="absolute inset-0 bg-foreground/55" />
        <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-8">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Buses in {city.name}
          </h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-white/85">
            <MapPin className="h-4 w-4" />
            {city.station_name}
            {city.station_address ? ` · ${city.station_address}` : ''}
          </p>
        </div>
      </section>

      <p className="mt-6 max-w-3xl text-sm text-muted-foreground">{city.description}</p>

      <div className="mt-8">
        <SearchForm
          initialFrom={city.slug}
          initialDate={todayISO()}
          initialPassengers={1}
        />
      </div>

      <div className="mt-12 space-y-10">
        <RouteList title={`Buses from ${city.name}`} routes={from} />
        <RouteList title={`Buses to ${city.name}`} routes={to} />
      </div>
    </div>
  );
}