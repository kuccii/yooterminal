import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';

import OperatorAvatar from '@/components/OperatorAvatar';
import Stars from '@/components/Stars';
import { useSiteContent } from '@/lib/SiteContentContext';

export default function OperatorsSection() {
  const { content } = useSiteContent();
  const [operators, setOperators] = useState([]);

  useEffect(() => {
    let active = true;
    db.entities.Operator
      .filter({ status: 'approved' }, { sort: '-rating', limit: 8 })
      .then((page) => {
        if (active) setOperators(page.items || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!operators.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{content.operators_heading}</h2>
        <Link to="/operator" className="text-sm font-semibold text-primary hover:underline">
          Operator dashboard
        </Link>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {operators.map((operator) => (
          <Link
            key={operator.slug}
            to={`/operator/${operator.slug}`}
            className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <OperatorAvatar name={operator.name} color={operator.brand_color} />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-bold">{operator.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {operator.country}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Stars rating={operator.rating} />
              <span className="text-xs text-muted-foreground">
                {Number(operator.rating || 0).toFixed(1)} · {operator.review_count || 0} reviews
              </span>
            </div>
            {operator.description && (
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{operator.description}</p>
            )}
            <span className="mt-4 flex items-center gap-1 text-sm font-semibold text-primary">
              View profile <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
