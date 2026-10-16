import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import NotificationBell from '@/components/NotificationBell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

const ROLE_LABELS = {
  admin: 'Admin',
  operator: 'Operator',
  user: 'User',
};

const initialsFor = (user) => {
  const source = user?.full_name || user?.email || '';
  const parts = source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part.charAt(0)).join('').toUpperCase() || '?';
};

function DashboardShell({ items, active, onNavigate, title, subtitle, user, children }) {
  const { logout } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();

  const activeItem = items.find((item) => item.id === active);
  const heading = title || activeItem?.label || '';
  const roleLabel = ROLE_LABELS[user?.role] || 'User';
  const displayName = user?.full_name || user?.email || 'Account';

  const handleNavigate = (id) => {
    onNavigate(id);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <Sidebar>
        <SidebarHeader className="gap-3 border-b border-sidebar-border px-4 py-4">
          <Link to="/" className="flex w-fit items-center" aria-label="YooTerminal home">
            <img src="/images/yooterminal-wordmark.png" alt="YooTerminal" className="h-7 w-auto dark:brightness-0 dark:invert" />
          </Link>
          <Link
            to="/"
            className="flex w-fit items-center gap-1.5 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to site
          </Link>
        </SidebarHeader>

        <SidebarContent>
          {items.length > 0 && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={active === item.id}
                        onClick={() => handleNavigate(item.id)}
                        tooltip={item.label}
                        className="data-[active=true]:bg-secondary data-[active=true]:font-semibold data-[active=true]:text-primary"
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="gap-0 border-t border-sidebar-border p-0">
          <div className="flex items-center gap-2.5 px-3 pt-3">
            <Avatar className="h-9 w-9">
              {user?.logo_path ? <AvatarImage src={user.logo_path} alt="" /> : null}
              <AvatarFallback className="bg-primary text-[11px] font-bold text-primary-foreground">
                {initialsFor(user)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{displayName}</p>
              {user?.email && (
                <p className="mt-0.5 truncate text-xs text-sidebar-foreground/70">{user.email}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-2">
            {user && (
              <span className="rounded-full border border-sidebar-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground">
                {roleLabel}
              </span>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4 py-3 md:px-6">
          <SidebarTrigger className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-extrabold tracking-tight md:text-2xl">{heading}</h1>
            {subtitle && (
              <p className="hidden truncate text-sm text-muted-foreground md:block">{subtitle}</p>
            )}
          </div>
          <NotificationBell className="shrink-0" />
          <ThemeToggle className="shrink-0" />
        </header>
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">{children}</div>
      </SidebarInset>
    </>
  );
}

export default function DashboardLayout({ items = [], active, onNavigate, title, subtitle, user, children }) {
  return (
    <SidebarProvider>
      <DashboardShell
        items={items}
        active={active}
        onNavigate={onNavigate}
        title={title}
        subtitle={subtitle}
        user={user}
      >
        {children}
      </DashboardShell>
    </SidebarProvider>
  );
}
