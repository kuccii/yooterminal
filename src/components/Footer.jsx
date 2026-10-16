import React from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '@/components/BrandMark';
import { useSiteContent } from '@/lib/SiteContentContext';

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
  const { content } = useSiteContent();

  return (
    <footer className="mt-16 border-t border-border bg-secondary/60">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <BrandMark />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">{content.footer_tagline}</p>
          </div>
          <Column title="Popular routes" links={content.footer_routes} />
          <Column title="Buses in Uganda" links={content.footer_ug_cities} />
          <Column title="Buses in Rwanda" links={content.footer_rw_cities} />
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} YooTerminal. Bus travel made easy.</p>
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