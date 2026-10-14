import React from 'react';
import { ShieldCheck, Ticket } from 'lucide-react';
import { Image } from '@/components/ui/image';
import SearchForm from '@/components/SearchForm';
import { IMAGES } from '@/lib/images';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-secondary via-secondary/50 to-background pb-10 pt-12 md:pb-16 md:pt-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground md:text-5xl">
              Cross-border coach tickets, booked in minutes
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Kampala to Kigali day and night coaches, plus Uganda&apos;s long-distance routes — Gulu, Mbale, Fort
              Portal, Mbarara and Kabale. Compare real terminal departures, pick your seat and pay with mobile money.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> Secure payment with Flutterwave
              </span>
              <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground">
                <Ticket className="h-4 w-4 text-primary" /> Instant e-tickets
              </span>
            </div>
          </div>

          <Image
            src={IMAGES.hero}
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