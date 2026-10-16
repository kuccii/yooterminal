import React from 'react';
import { HeartHandshake, ShieldCheck, Ticket, Wallet } from 'lucide-react';

import { useSiteContent } from '@/lib/SiteContentContext';

const ICONS = [Wallet, Ticket, ShieldCheck, HeartHandshake];

export default function WhySection() {
  const { features } = useSiteContent();

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, index) => {
          const Icon = ICONS[index % ICONS.length];
          return (
            <div key={feature.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <h3 className="mt-4 font-display text-base font-bold">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
