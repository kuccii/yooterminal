import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, BusFront, Image as ImageIcon, LayoutDashboard, Map, ShieldCheck, Users } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Skeleton } from '@/components/ui/skeleton';
import AdminContentTab from '@/components/admin/AdminContentTab';
import AdminOperatorsTab from '@/components/admin/AdminOperatorsTab';
import AdminOperationsTab from '@/components/admin/AdminOperationsTab';
import AdminOverviewTab from '@/components/admin/AdminOverviewTab';
import AdminReportsTab from '@/components/admin/AdminReportsTab';
import AdminRoutesTab from '@/components/admin/AdminRoutesTab';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'operators', label: 'Operators', icon: Users },
  { id: 'routes', label: 'Routes & stops', icon: Map },
  { id: 'operations', label: 'Fleet & departures', icon: BusFront },
  { id: 'content', label: 'Content', icon: ImageIcon },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

const SUBTITLE = 'Run the network: approve operators, set commission, curate the route catalogue and watch the numbers.';

export default function AdminPanel() {
  const { user, isLoadingAuth } = useAuth();
  const [active, setActive] = useState('overview');
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
  const sectionTitle = NAV_ITEMS.find((item) => item.id === active)?.label || 'Admin panel';

  useEffect(() => {
    if (!isLoadingAuth && isAdmin) load();
  }, [isLoadingAuth, isAdmin, load]);

  if (isLoadingAuth || (isAdmin && state.loading)) {
    return (
      <DashboardLayout
        items={NAV_ITEMS}
        active={active}
        onNavigate={setActive}
        title={sectionTitle}
        subtitle={SUBTITLE}
        user={user}
      >
        <Skeleton className="h-40 w-full rounded-3xl" />
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardLayout items={[]} active={active} onNavigate={setActive} title="Admin panel" user={user}>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 font-display text-2xl font-extrabold">This area is for the platform team</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask the app owner to give your account the admin role if you need to manage operators, fares or content.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const renderSection = () => {
    switch (active) {
      case 'overview':
        return (
          <AdminOverviewTab
            operators={state.operators}
            routes={state.routes}
            onChanged={load}
            onNavigate={setActive}
          />
        );
      case 'routes':
        return <AdminRoutesTab routes={state.routes} cities={state.cities} onChanged={load} />;
      case 'operations':
        return <AdminOperationsTab operators={state.operators} routes={state.routes} />;
      case 'content':
        return <AdminContentTab />;
      case 'reports':
        return <AdminReportsTab operators={state.operators} routes={state.routes} />;
      case 'operators':
      default:
        return <AdminOperatorsTab operators={state.operators} setting={state.setting} onChanged={load} />;
    }
  };

  return (
    <DashboardLayout
      items={NAV_ITEMS}
      active={active}
      onNavigate={setActive}
      title={sectionTitle}
      subtitle={SUBTITLE}
      user={user}
    >
      {renderSection()}
    </DashboardLayout>
  );
}
