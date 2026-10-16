import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import db from '@/api/client';

const DEFAULT_CONTENT = {
  hero_headline: 'Cross-border coach tickets, booked in minutes',
  hero_sub:
    "Kampala to Kigali day and night coaches, plus Uganda's long-distance routes \u2014 Gulu, Mbale, Fort Portal, Mbarara and Kabale. Compare real terminal departures, pick your seat and pay with mobile money.",
  hero_badge_payment: 'Secure payment with Flutterwave',
  hero_badge_ticket: 'Instant e-tickets',
  hero_image: '',
  faq_heading: 'Frequently asked questions',
  trust_heading: 'People from around the world trust YooTerminal',
  trust_rating_fallback: 'Rated by travellers on every route',
  trust_note: 'Reviews from passengers who travelled with our partner operators',
  operators_heading: 'Bus companies on the network',
  routes_heading: 'Top travelled bus routes',
  countries_heading: 'Popular places in Uganda & Rwanda',
  footer_tagline:
    'Compare and book bus tickets across Uganda and Rwanda. Instant e-tickets, secure payment and 24/7 support.',
  countries: [
    { name: 'Uganda', image: '/images/kampala.svg' },
    { name: 'Rwanda', image: '/images/kigali.svg' },
  ],
  footer_routes: [
    ['Kampala to Kigali', '/routes/kampala-kigali'],
    ['Kigali to Kampala', '/routes/kigali-kampala'],
    ['Kampala to Mbarara', '/routes/kampala-mbarara'],
    ['Kampala to Gulu', '/routes/kampala-gulu'],
    ['Kigali to Musanze', '/routes/kigali-musanze'],
    ['Kigali to Rubavu', '/routes/kigali-rubavu'],
  ],
  footer_ug_cities: [
    ['Kampala', '/city/kampala'],
    ['Entebbe', '/city/entebbe'],
    ['Jinja', '/city/jinja'],
    ['Mbarara', '/city/mbarara'],
  ],
  footer_rw_cities: [
    ['Kigali', '/city/kigali'],
    ['Musanze', '/city/musanze'],
    ['Rubavu', '/city/rubavu'],
    ['Huye', '/city/huye'],
  ],
};

const DEFAULT_FAQS = [
  {
    question: 'How do I book a bus ticket on YooTerminal?',
    answer:
      'Search your route, compare departures and fares from every operator on that route, pick your seats, and pay securely by card or mobile money. Your e-ticket arrives instantly — no printing needed.',
  },
  {
    question: 'Which bus operators can I book?',
    answer:
      'We compare coaches from operators across Uganda and Rwanda, including Link Bus Services, YY Coaches, Jaguar Executive Coaches, Trinity Express, Volcano Express, Ritco and more.',
  },
  {
    question: 'How can I pay for my ticket?',
    answer:
      'Payments are handled by Flutterwave. You can pay with a debit or credit card, or with MTN and Airtel Mobile Money in Uganda and Rwanda.',
  },
  {
    question: 'Do I need a passport for the Kampala to Kigali route?',
    answer:
      'Yes. The Kampala–Kigali coach crosses the Gatuna/Katuna border, so bring a valid passport or East African Community ID and expect a border stop of around 45 minutes.',
  },
  {
    question: 'How early should I arrive at the bus park?',
    answer:
      'Arrive at least 30 minutes before departure so the conductor can check your ticket and load your luggage. Most operators close boarding 10 minutes before departure.',
  },
  {
    question: 'Can I change or cancel my booking?',
    answer:
      'Sign in to My trips to cancel a booking before departure. Operator refund rules apply, and our 24/7 support team can help with changes.',
  },
];

const DEFAULT_FEATURES = [
  { title: 'Compare real fares', description: 'Every departure from Uganda and Rwanda coach operators, side by side.' },
  { title: 'Instant e-tickets', description: 'Book your seat and get your ticket in seconds — no printing needed.' },
  { title: 'Secure payment', description: 'Pay by card or mobile money through Flutterwave, safely encrypted.' },
  { title: '24/7 customer service', description: 'Our team is here to help at every step, before and after you travel.' },
];

function sanitizeLinkList(value) {
  if (!Array.isArray(value)) return null;
  const items = value.filter(
    (row) => Array.isArray(row) && typeof row[0] === 'string' && row[0].trim() && typeof row[1] === 'string' && row[1].trim(),
  );
  return items.length ? items : null;
}

function sanitizeCountries(value) {
  if (!Array.isArray(value)) return null;
  const items = value.filter(
    (row) => row && typeof row.name === 'string' && row.name.trim() && typeof row.image === 'string',
  );
  return items.length ? items : null;
}

function sanitizeFaqs(value) {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((row) => row && typeof row.question === 'string' && row.question.trim())
    .map((row) => ({ question: row.question, answer: typeof row.answer === 'string' ? row.answer : '' }));
  return items.length ? items : null;
}

function sanitizeFeatures(value) {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((row) => row && typeof row.title === 'string' && row.title.trim())
    .map((row) => ({
      title: row.title,
      description: typeof row.description === 'string' ? row.description : '',
    }));
  return items.length ? items : null;
}

function mergeContent(incoming) {
  const source = incoming && typeof incoming === 'object' ? incoming : {};
  const merged = {};
  for (const [key, fallback] of Object.entries(DEFAULT_CONTENT)) {
    const value = source[key];
    if (Array.isArray(fallback)) {
      merged[key] = key === 'countries' ? sanitizeCountries(value) || fallback : sanitizeLinkList(value) || fallback;
    } else if (value === undefined || value === null || value === '') {
      merged[key] = fallback;
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

const SiteContentContext = createContext(null);

export function SiteContentProvider({ children }) {
  const [content, setContent] = useState(() => ({ ...DEFAULT_CONTENT }));
  const [faqs, setFaqs] = useState(DEFAULT_FAQS);
  const [features, setFeatures] = useState(DEFAULT_FEATURES);

  const load = useCallback(async () => {
    try {
      const data = await db.siteContent.get();
      if (!data) return;
      setContent(mergeContent(data.content));
      setFaqs(sanitizeFaqs(data.faqs) || DEFAULT_FAQS);
      setFeatures(sanitizeFeatures(data.features) || DEFAULT_FEATURES);
    } catch {
      setContent({ ...DEFAULT_CONTENT });
      setFaqs(DEFAULT_FAQS);
      setFeatures(DEFAULT_FEATURES);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo(() => ({ content, faqs, features, refresh: load }), [content, faqs, features, load]);

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent() {
  const context = useContext(SiteContentContext);
  if (!context) throw new Error('useSiteContent must be used within SiteContentProvider');
  return context;
}
