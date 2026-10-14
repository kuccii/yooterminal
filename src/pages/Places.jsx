import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';

import { Image } from '@/components/ui/image';
import { Skeleton } from '@/components/ui/skeleton';
import { IMAGES } from '@/lib/images';

const COUNTRY_IMAGES = { Uganda: IMAGES.kampala, Rwanda: IMAGES.kigali };

export default function Places() {
  const [state, setState] = useState({ loading: true, cities: [] });

  useEffect(() => {
    let active = true;
    db.entities.City
      .filter({}, { sort: 'name', limit: 100 })
      .then((page) => {
        if (active) setState({ loading: false, cities: page.items || [] });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-96 w-full rounded-3xl" />
      </div>
    );
  }

  const countries = ['Uganda', 'Rwanda'];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Places</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Compare bus tickets in every city we cover across Uganda and Rwanda. Pick a city to see its bus park and the
        routes leaving from it.
      </p>

      <div className="mt-10 space-y-12">
        {countries.map((country) => {
          const cities = state.cities.filter((city) => city.country === country);
          return (
            <section key={country}>
              <div className="relative overflow-hidden rounded-3xl border border-border">
                <Image
                  src={COUNTRY_IMAGES[country]}
                  alt={country}
                  className="h-40 w-full object-cover"
                />
                <div className="absolute inset-0 bg-foreground/55" />
                <div className="absolute inset-0 flex items-end p-6">
                  <h2 className="font-display text-2xl font-extrabold text-white">
                    {country} · {cities.length} cities
                  </h2>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cities.map((city) => (
                  <Link
                    key={city.slug}
                    to={`/city/${city.slug}`}
                    className="rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <p className="font-display text-base font-bold">{city.name}</p>
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      {city.station_name}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}