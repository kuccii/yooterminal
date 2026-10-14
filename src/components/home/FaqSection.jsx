import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const FAQS = [
  {
    q: 'How do I book a bus ticket on YooTerminal?',
    a: 'Search your route, compare departures and fares from every operator on that route, pick your seats, and pay securely by card or mobile money. Your e-ticket arrives instantly — no printing needed.',
  },
  {
    q: 'Which bus operators can I book?',
    a: 'We compare coaches from operators across Uganda and Rwanda, including Link Bus Services, YY Coaches, Jaguar Executive Coaches, Trinity Express, Volcano Express, Ritco and more.',
  },
  {
    q: 'How can I pay for my ticket?',
    a: 'Payments are handled by Flutterwave. You can pay with a debit or credit card, or with MTN and Airtel Mobile Money in Uganda and Rwanda.',
  },
  {
    q: 'Do I need a passport for the Kampala to Kigali route?',
    a: 'Yes. The Kampala–Kigali coach crosses the Gatuna/Katuna border, so bring a valid passport or East African Community ID and expect a border stop of around 45 minutes.',
  },
  {
    q: 'How early should I arrive at the bus park?',
    a: 'Arrive at least 30 minutes before departure so the conductor can check your ticket and load your luggage. Most operators close boarding 10 minutes before departure.',
  },
  {
    q: 'Can I change or cancel my booking?',
    a: 'Sign in to My trips to cancel a booking before departure. Operator refund rules apply, and our 24/7 support team can help with changes.',
  },
];

export default function FaqSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-14">
      <h2 className="text-center font-display text-2xl font-extrabold tracking-tight">Frequently asked questions</h2>
      <Accordion type="single" collapsible className="mt-8">
        {FAQS.map((item, index) => (
          <AccordionItem key={item.q} value={`faq-${index}`} className="border-border">
            <AccordionTrigger className="text-left font-semibold hover:no-underline">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}