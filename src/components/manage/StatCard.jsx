import React from 'react';
import { Card } from '@/components/ui/card';

export default function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <Card className="rounded-2xl border-border p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}