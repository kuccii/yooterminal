import React from 'react';
import { ShieldCheck, Ticket } from 'lucide-react';
import { Image } from '@/components/ui/image';
import SearchForm from '@/components/SearchForm';
import { IMAGES } from '@/lib/images';
import { useSiteContent } from '@/lib/SiteContentContext';

export default function Hero() {
  const { content } = useSiteContent();

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-secondary via-secondary/50 to-background pb-10 pt-12 md:pb-16 md:pt-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground md:text-5xl">
              {content.hero_headline}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">{content.hero_sub}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> {content.hero_badge_payment}
              </span>
              <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground">
                <Ticket className="h-4 w-4 text-primary" /> {content.hero_badge_ticket}
              </span>
            </div>
          </div>

          <Image
            src={content.hero_image || IMAGES.hero}
            fittingType="fit"
            alt="Travellers boarding an intercity coach"
            className="mx-auto w-full max-w-md"
          />
        </div>

        <div className="mt-8">
          <SearchForm />
        </div>
      </div>
    </section>
  );
}