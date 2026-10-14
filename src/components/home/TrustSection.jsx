import db from '@/api/client';

import React, { useEffect, useState } from 'react';

import { BadgeCheck } from 'lucide-react';
import Stars from '@/components/Stars';

export default function TrustSection() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    db.entities.Review
      .aggregate({ query: { status: 'published' }, avg: 'rating' })
      .then((result) => {
        const row = result?.rows?.[0];
        if (active && row) setStats({ average: row.avg_rating, count: row.count });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-10 text-center">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">People from around the world trust BusLink</h2>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <span className="rounded-full bg-[hsl(var(--trust))] px-3 py-1 text-sm font-bold text-white">Excellent</span>
          <Stars rating={stats?.average || 5} size="lg" />
          <span className="text-sm text-muted-foreground">
            {stats ? `${Number(stats.average).toFixed(1)} out of 5 · ${stats.count} traveller reviews` : 'Rated by travellers on every route'}
          </span>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck className="h-4 w-4 text-[hsl(var(--trust))]" />
          Reviews from passengers who travelled with our partner operators
        </p>
      </div>
    </section>
  );
}