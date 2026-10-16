import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BusFront, MapPin } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import UserMenu from '@/components/UserMenu';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationBell from '@/components/NotificationBell';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

function NavPill({ to, label, icon: Icon, active }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
        active ? 'bg-secondary text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export default function Header() {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const placesActive = pathname.startsWith('/places') || pathname.startsWith('/city');

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <BrandMark />

        <nav className="mx-auto hidden items-center gap-0.5 rounded-full border border-border bg-card p-1 shadow-sm md:flex">
          <NavPill to="/" label="Buses" icon={BusFront} active={!placesActive} />
          <NavPill to="/places" label="Places" icon={MapPin} active={placesActive} />
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            to="/help"
            className="hidden rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground sm:block"
          >
            Help
          </Link>
          {isAuthenticated ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition hover:border-primary hover:text-primary"
            >
              Sign in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>

      <nav className="flex items-center gap-1 border-t border-border/70 px-4 py-2 md:hidden">
        <NavPill to="/" label="Buses" icon={BusFront} active={!placesActive} />
        <NavPill to="/places" label="Places" icon={MapPin} active={placesActive} />
        <Link to="/help" className="ml-auto px-2 text-sm font-semibold text-muted-foreground">
          Help
        </Link>
      </nav>
    </header>
  );
}