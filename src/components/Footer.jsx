import React from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '@/components/BrandMark';

const POPULAR_ROUTES = [
  ['Kampala to Kigali', '/routes/kampala-kigali'],
  ['Kigali to Kampala', '/routes/kigali-kampala'],
  ['Kampala to Mbarara', '/routes/kampala-mbarara'],
  ['Kampala to Gulu', '/routes/kampala-gulu'],
  ['Kigali to Musanze', '/routes/kigali-musanze'],
  ['Kigali to Rubavu', '/routes/kigali-rubavu'],
];

const UG_CITIES = [
  ['Kampala', '/city/kampala'],
  ['Entebbe', '/city/entebbe'],
  ['Jinja', '/city/jinja'],
  ['Mbarara', '/city/mbarara'],
];

const RW_CITIES = [
  ['Kigali', '/city/kigali'],
  ['Musanze', '/city/musanze'],
  ['Rubavu', '/city/rubavu'],
  ['Huye', '/city/huye'],
];

function Column({ title, links }) {
  return (
    <div>
      <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link to={href} className="transition hover:text-primary">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-secondary/60">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <BrandMark />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Compare and book bus tickets across Uganda and Rwanda. Instant e-tickets, secure payment and 24/7 support.
            </p>
          </div>
          <Column title="Popular routes" links={POPULAR_ROUTES} />
          <Column title="Buses in Uganda" links={UG_CITIES} />
          <Column title="Buses in Rwanda" links={RW_CITIES} />
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} BusLink. Bus travel made easy.</p>
          <p className="flex gap-4">
            <Link to="/help" className="transition hover:text-primary">
              Help
            </Link>
            <Link to="/places" className="transition hover:text-primary">
              All places
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}