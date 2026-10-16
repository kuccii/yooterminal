import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { Image } from '@/components/ui/image';
import { formatMoney, formatDuration } from '@/lib/format';
import { IMAGES } from '@/lib/images';
import { useSiteContent } from '@/lib/SiteContentContext';

export default function TopRoutes() {
  const { content } = useSiteContent();
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    let active = true;
    db.entities.Route
      .filter({ popular: true }, { sort: 'from_price', limit: 8 })
      .then((page) => {
        if (active) setRoutes(page.items || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!routes.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">{content.routes_heading}</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {routes.map((route) => (
          <Link
            key={route.slug}
            to={`/routes/${route.slug}`}
            className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative h-36 w-full overflow-hidden bg-secondary">
              <Image
                src={route.image_url || IMAGES.busRoad}
                alt={`Buses from ${route.origin_city} to ${route.destination_city}`}
                className="h-36 w-full object-cover transition duration-500 group-hover:scale-105"
              />
            </div>
            <div className="p-4">
              <p className="flex items-center gap-1.5 font-display text-base font-bold">
                {route.origin_city}
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                {route.destination_city}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDuration(route.duration_minutes)}
                {route.crossing_border && ' · Cross-border'}
              </p>
              <p className="mt-3 text-sm font-semibold text-primary">
                from {formatMoney(route.from_price, route.currency)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}