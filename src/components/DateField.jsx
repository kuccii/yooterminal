import React from 'react';
import { CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function DateField({ value, onChange, label = 'Date' }) {
  const selected = value ? parseISO(value) : new Date();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-secondary/70"
        >
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="block truncate text-sm font-semibold">{format(selected, 'EEE, d MMM')}</span>
          </span>
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          initialFocus
          selected={selected}
          disabled={{ before: new Date() }}
          onSelect={(date) => date && onChange(format(date, 'yyyy-MM-dd'))}
        />
      </PopoverContent>
    </Popover>
  );
}