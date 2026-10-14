import React from 'react';
import { HeartHandshake, ShieldCheck, Ticket, Wallet } from 'lucide-react';

const ITEMS = [
  {
    icon: Wallet,
    title: 'Compare real fares',
    text: 'Every departure from Uganda and Rwanda coach operators, side by side.',
  },
  {
    icon: Ticket,
    title: 'Instant e-tickets',
    text: 'Book your seat and get your ticket in seconds — no printing needed.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure payment',
    text: 'Pay by card or mobile money through Flutterwave, safely encrypted.',
  },
  {
    icon: HeartHandshake,
    title: '24/7 customer service',
    text: 'Our team is here to help at every step, before and after you travel.',
  },
];

export default function WhySection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((item) => (
          <div key={item.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
              <item.icon className="h-5 w-5 text-primary" />
            </span>
            <h3 className="mt-4 font-display text-base font-bold">{item.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}