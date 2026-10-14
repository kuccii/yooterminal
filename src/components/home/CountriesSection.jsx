import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';

import { Image } from '@/components/ui/image';
import { IMAGES } from '@/lib/images';

const COUNTRY_IMAGES = { Uganda: IMAGES.kampala, Rwanda: IMAGES.kigali };

export default function CountriesSection() {
  const [cities, setCities] = useState([]);

  useEffect(() => {
    let active = true;
    db.entities.City
      .filter({ featured: true }, { sort: 'name', limit: 12 })
      .then((page) => {
        if (active) setCities(page.items || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const countries = ['Uganda', 'Rwanda'];

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">Popular places in Uganda &amp; Rwanda</h2>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {countries.map((country) => {
          const countryCities = cities.filter((city) => city.country === country);
          return (
            <div key={country} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <div className="relative h-44 w-full overflow-hidden bg-secondary">
                <Image
                  src={COUNTRY_IMAGES[country]}
                  alt={country}
                  className="h-44 w-full object-cover"
                />
                <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-sm font-bold backdrop-blur">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {country}
                </span>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-2">
                  {countryCities.map((city) => (
                    <Link
                      key={city.slug}
                      to={`/city/${city.slug}`}
                      className="rounded-full border border-border px-3 py-1.5 text-sm font-medium transition hover:border-primary hover:text-primary"
                    >
                      {city.name}
                    </Link>
                  ))}
                </div>
                <Link
                  to="/places"
                  className="mt-4 inline-block text-sm font-semibold text-primary transition hover:underline"
                >
                  See all cities in {country}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}