import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { Image } from '@/components/ui/image';

export default function PromoBanners() {
  const [banners, setBanners] = useState([]);

  useEffect(() => {
    let active = true;
    db.entities.Banner
      .filter({ active: true, placement: 'home_strip' }, { sort: 'sort_order', limit: 3 })
      .then((page) => {
        if (active) setBanners(page.items || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!banners.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-4 md:grid-cols-2">
        {banners.map((banner) => {
          const body = (
            <>
              {banner.image_url && (
                <div className="relative h-32 w-full overflow-hidden rounded-2xl bg-secondary sm:h-36">
                  <Image
                    src={banner.image_url}
                    alt={banner.title}
                    className="h-32 w-full object-cover sm:h-36"
                  />
                </div>
              )}
              <div className="mt-3">
                <p className="font-display text-lg font-extrabold tracking-tight">{banner.title}</p>
                {banner.subtitle && <p className="mt-1 text-sm text-muted-foreground">{banner.subtitle}</p>}
                {banner.cta_label && (
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    {banner.cta_label} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            </>
          );

          const target = banner.link_url || '/search';
          const isExternal = /^https?:\/\//.test(target);

          return isExternal ? (
            <a
              key={banner.id}
              href={target}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {body}
            </a>
          ) : (
            <Link
              key={banner.id}
              to={target}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}