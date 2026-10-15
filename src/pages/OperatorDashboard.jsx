import db from '@/api/client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, BusFront, CalendarClock, LayoutDashboard, ScanLine, Ticket, UsersRound, Wallet } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import OperatorAvatar from '@/components/OperatorAvatar';
import OperatorBookingsTab from '@/components/operator/OperatorBookingsTab';
import OperatorCustomersTab from '@/components/operator/OperatorCustomersTab';
import OperatorEarningsTab from '@/components/operator/OperatorEarningsTab';
import OperatorFleetTab from '@/components/operator/OperatorFleetTab';
import OperatorOverviewTab from '@/components/operator/OperatorOverviewTab';
import OperatorReportsTab from '@/components/operator/OperatorReportsTab';
import OperatorTimetableTab from '@/components/operator/OperatorTimetableTab';
import OperatorValidationTab from '@/components/operator/OperatorValidationTab';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_STYLES = {
  approved: 'bg-[hsl(var(--trust))] text-white',
  pending: 'bg-secondary text-primary',
  suspended: 'bg-destructive text-destructive-foreground',
};

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'timetable', label: 'Timetable & fares', icon: CalendarClock },
  { id: 'fleet', label: 'Fleet', icon: BusFront },
  { id: 'bookings', label: 'Booked tickets', icon: Ticket },
  { id: 'validation', label: 'Ticket validation', icon: ScanLine },
  { id: 'earnings', label: 'Earnings', icon: Wallet },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'customers', label: 'Customers', icon: UsersRound },
];

export default function OperatorDashboard() {
  const { user, isLoadingAuth } = useAuth();
  const [active, setActive] = useState('overview');
  const [state, setState] = useState({ loading: true, operators: [], routes: [], setting: null, picked: '' });

  const load = useCallback(async () => {
    const [operators, routes, settings] = await Promise.all([
      db.entities.Operator.list({ sort: 'name', limit: 200 }),
      db.entities.Route.list({ sort: 'origin_city', limit: 200 }),
      db.entities.PlatformSetting.list({ limit: 1 }),
    ]);
    setState({
      loading: false,
      operators: operators.items || [],
      routes: routes.items || [],
      setting: settings.items?.[0] || null,
      picked: '',
    });
  }, []);

  useEffect(() => {
    if (!isLoadingAuth && user) load();
  }, [isLoadingAuth, user, load]);

  const email = (user?.email || '').toLowerCase();
  const isAdmin = user?.role === 'admin';
  const isOperatorRole = user?.role === 'operator';

  const options = useMemo(() => {
    if (isAdmin) return state.operators;
    if (!isOperatorRole && user?.role !== 'user') return [];
    return state.operators.filter((operator) => operator.owner_email && operator.owner_email.toLowerCase() === email);
  }, [isAdmin, isOperatorRole, state.operators, email, user?.role]);

  if (isLoadingAuth || state.loading) {
    return (
      <DashboardLayout items={NAV_ITEMS} active={active} onNavigate={setActive} user={user}>
        <div className="space-y-6">
          <Skeleton className="h-24 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </DashboardLayout>
    );
  }

  const operator = options.find((entry) => entry.slug === state.picked) || options[0] || null;

  if (!operator) {
    return (
      <DashboardLayout
        items={[]}
        active={active}
        onNavigate={setActive}
        title="Operator dashboard"
        user={user}
      >
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <LayoutDashboard className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 font-display text-2xl font-extrabold">No operator dashboard yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your email is not linked to a bus company on the network. Ask the platform team to add you as the dashboard
            owner of your company, then sign in again.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const renderSection = () => {
    switch (active) {
      case 'overview':
        return <OperatorOverviewTab operator={operator} routes={state.routes} onNavigate={setActive} />;
      case 'fleet':
        return <OperatorFleetTab operator={operator} />;
      case 'bookings':
        return <OperatorBookingsTab operator={operator} />;
      case 'validation':
        return <OperatorValidationTab operator={operator} user={user} />;
      case 'earnings':
        return <OperatorEarningsTab operator={operator} setting={state.setting} />;
      case 'reports':
        return <OperatorReportsTab operator={operator} routes={state.routes} />;
      case 'customers':
        return <OperatorCustomersTab operator={operator} />;
      case 'timetable':
      default:
        return <OperatorTimetableTab operator={operator} routes={state.routes} />;
    }
  };

  return (
    <DashboardLayout items={NAV_ITEMS} active={active} onNavigate={setActive} user={user}>
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <OperatorAvatar name={operator.name} color={operator.brand_color} size="lg" />
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">{operator.name}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    STATUS_STYLES[operator.status || 'pending']
                  }`}
                >
                  {operator.status || 'pending'}
                </span>
                <span>{operator.country}</span>
              </p>
            </div>
          </div>

          {options.length > 1 && (
            <Select value={operator.slug} onValueChange={(value) => setState({ ...state, picked: value })}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((entry) => (
                  <SelectItem key={entry.slug} value={entry.slug}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isAdmin && !operator.owner_email && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-secondary p-3 text-xs font-medium text-primary">
            <BusFront className="h-4 w-4" />
            Assign a dashboard owner email in the admin panel to let this company sign in themselves.
          </p>
        )}
      </Card>

      <div className="mt-6">{renderSection()}</div>
    </DashboardLayout>
  );
}
