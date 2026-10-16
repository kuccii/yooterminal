import React from 'react';
import { Card } from '@/components/ui/card';

export default function StatCard({ label, value, hint, icon: Icon, onClick }) {
  const Tag = onClick ? 'button' : Card;
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-2xl border-border p-4 shadow-sm${
        onClick
          ? ' w-full text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : ''
      }`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        {label}
      </span>
      <span className="mt-2 block font-display text-2xl font-extrabold tracking-tight">{value}</span>
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </Tag>
  );
}
