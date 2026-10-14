import db from '@/api/client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BusFront, LayoutDashboard } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import OperatorAvatar from '@/components/OperatorAvatar';
import OperatorBookingsTab from '@/components/operator/OperatorBookingsTab';
import OperatorEarningsTab from '@/components/operator/OperatorEarningsTab';
import OperatorFleetTab from '@/components/operator/OperatorFleetTab';
import OperatorTimetableTab from '@/components/operator/OperatorTimetableTab';
import OperatorValidationTab from '@/components/operator/OperatorValidationTab';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_STYLES = {
  approved: 'bg-[hsl(var(--trust))] text-white',
  pending: 'bg-secondary text-primary',
  suspended: 'bg-destructive text-destructive-foreground',
};

export default function OperatorDashboard() {
  const { user, isLoadingAuth } = useAuth();
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

  const options = useMemo(() => {
    if (isAdmin) return state.operators;
    return state.operators.filter((operator) => operator.owner_email && operator.owner_email.toLowerCase() === email);
  }, [isAdmin, state.operators, email]);

  if (isLoadingAuth || state.loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="mt-6 h-64 w-full rounded-3xl" />
      </div>
    );
  }

  const operator = options.find((entry) => entry.slug === state.picked) || options[0] || null;

  if (!operator) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <LayoutDashboard className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl font-extrabold">No operator dashboard yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your email is not linked to a bus company on the network. Ask the platform team to add you as the dashboard
          owner of your company, then sign in again.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <OperatorAvatar name={operator.name} color={operator.brand_color} size="lg" />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold tracking-tight">{operator.name}</h1>
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

      <Tabs defaultValue="timetable" className="mt-8">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="timetable">Timetable &amp; fares</TabsTrigger>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="bookings">Booked tickets</TabsTrigger>
          <TabsTrigger value="validation">Ticket validation</TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
        </TabsList>

        <TabsContent value="timetable" className="mt-6">
          <OperatorTimetableTab operator={operator} routes={state.routes} />
        </TabsContent>
        <TabsContent value="fleet" className="mt-6">
          <OperatorFleetTab operator={operator} />
        </TabsContent>
        <TabsContent value="bookings" className="mt-6">
          <OperatorBookingsTab operator={operator} />
        </TabsContent>
        <TabsContent value="validation" className="mt-6">
          <OperatorValidationTab operator={operator} user={user} />
        </TabsContent>
        <TabsContent value="earnings" className="mt-6">
          <OperatorEarningsTab operator={operator} setting={state.setting} />
        </TabsContent>
      </Tabs>
    </div>
  );
}