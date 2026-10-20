import db from '@/api/client';

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { Image } from '@/components/ui/image';
import { IMAGES } from '@/lib/images';
import { useSiteContent } from '@/lib/SiteContentContext';
import { useAutoSlide } from '@/lib/useAutoSlide';

const COUNTRY_IMAGES = { Uganda: IMAGES.kampala, Rwanda: IMAGES.kigali };

export default function CountriesSection() {
  const { content } = useSiteContent();
  const [cities, setCities] = useState([]);
  const [api, setApi] = useState(null);
  const [paused, setPaused] = useState(false);

  useAutoSlide(api, { paused });

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

  const countryImages = useMemo(() => {
    const map = {};
    (content.countries || []).forEach((country) => {
      map[country.name] = country.image || COUNTRY_IMAGES[country.name];
    });
    return map;
  }, [content.countries]);

  if (!cities.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{content.countries_heading}</h2>
        <Link to="/places" className="text-sm font-semibold text-primary hover:underline">
          All places
        </Link>
      </div>

      <div
        className="mt-8"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <Carousel setApi={setApi} opts={{ loop: true, align: 'start' }} className="px-1">
          <CarouselContent>
            {cities.map((city) => (
              <CarouselItem key={city.slug} className="sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                <Link
                  to={`/city/${city.slug}`}
                  className="group block overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative h-40 w-full overflow-hidden bg-secondary">
                    <Image
                      src={city.image_url || countryImages[city.country] || IMAGES.busPark}
                      alt={city.name}
                      className="h-40 w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-bold backdrop-blur">
                      <MapPin className="h-3 w-3 text-primary" />
                      {city.country}
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="font-display text-base font-bold">{city.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {city.station_name || city.description || `Buses to and from ${city.name}`}
                    </p>
                    <span className="mt-3 inline-block text-sm font-semibold text-primary">Explore {city.name}</span>
                  </div>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="-left-3 hidden md:flex" />
          <CarouselNext className="-right-3 hidden md:flex" />
        </Carousel>
      </div>
    </section>
  );
}
