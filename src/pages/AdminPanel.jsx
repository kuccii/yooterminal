import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AdminContentTab from '@/components/admin/AdminContentTab';
import AdminOperatorsTab from '@/components/admin/AdminOperatorsTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';
import AdminRoutesTab from '@/components/admin/AdminRoutesTab';

export default function AdminPanel() {
  const { user, isLoadingAuth } = useAuth();
  const [state, setState] = useState({
    loading: true,
    operators: [],
    routes: [],
    cities: [],
    setting: null,
  });

  const load = useCallback(async () => {
    const [operators, routes, cities, settings] = await Promise.all([
      db.entities.Operator.list({ sort: 'name', limit: 200 }),
      db.entities.Route.list({ sort: 'origin_city', limit: 200 }),
      db.entities.City.list({ sort: 'name', limit: 100 }),
      db.entities.PlatformSetting.list({ limit: 1 }),
    ]);
    setState({
      loading: false,
      operators: operators.items || [],
      routes: routes.items || [],
      cities: cities.items || [],
      setting: settings.items?.[0] || null,
    });
  }, []);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isLoadingAuth && isAdmin) load();
  }, [isLoadingAuth, isAdmin, load]);

  if (isLoadingAuth || (isAdmin && state.loading)) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl font-extrabold">This area is for the platform team</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask the app owner to give your account the admin role if you need to manage operators, fares or content.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin panel</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Run the network: approve operators, set commission, curate the route catalogue and watch the numbers.
      </p>

      <Tabs defaultValue="operators" className="mt-8">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="operators">Operators</TabsTrigger>
          <TabsTrigger value="routes">Routes &amp; stops</TabsTrigger>
          <TabsTrigger value="content">Banners, coupons &amp; reviews</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="operators" className="mt-6">
          <AdminOperatorsTab operators={state.operators} setting={state.setting} onChanged={load} />
        </TabsContent>
        <TabsContent value="routes" className="mt-6">
          <AdminRoutesTab routes={state.routes} cities={state.cities} onChanged={load} />
        </TabsContent>
        <TabsContent value="content" className="mt-6">
          <AdminContentTab />
        </TabsContent>
        <TabsContent value="reports" className="mt-6">
          <AdminReportsTab operators={state.operators} routes={state.routes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}