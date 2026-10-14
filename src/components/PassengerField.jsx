import React from 'react';
import { Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function PassengerField({ value = 1, onChange }) {
  return (
    <div className="rounded-2xl px-3 py-2.5 transition hover:bg-secondary/70">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Passengers
      </span>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger className="mt-0.5 h-6 w-full border-0 p-0 text-sm font-semibold shadow-none focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5, 6].map((count) => (
            <SelectItem key={count} value={String(count)}>
              {count} {count === 1 ? 'passenger' : 'passengers'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}