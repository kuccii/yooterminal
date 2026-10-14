import React from 'react';
import { seatRows } from '@/lib/trips';
import { cn } from '@/lib/utils';

function SeatButton({ label, state, onToggle }) {
  if (!label) return <span className="h-10 w-10" />;
  const disabled = state === 'taken';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(label)}
      className={cn(
        'h-10 w-10 rounded-lg border text-xs font-semibold transition',
        state === 'taken' && 'cursor-not-allowed border-border bg-muted text-muted-foreground/50',
        state === 'selected' && 'border-primary bg-primary text-primary-foreground shadow-sm',
        state === 'free' && 'border-border bg-card text-foreground hover:border-primary hover:text-primary'
      )}
    >
      {label}
    </button>
  );
}

export default function SeatMap({ total = 0, layout = '2x2', taken = [], selected = [], onToggle }) {
  const rows = seatRows(total, layout);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-border bg-card" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-primary" /> Your seats
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-muted" /> Taken
        </span>
      </div>

      <div className="mx-auto w-full max-w-[280px]">
        <div className="mb-3 rounded-lg bg-muted py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Front · Driver
        </div>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center justify-center gap-2">
              <SeatButton
                label={row[0]}
                state={taken.includes(row[0]) ? 'taken' : selected.includes(row[0]) ? 'selected' : 'free'}
                onToggle={onToggle}
              />
              <SeatButton
                label={row[1]}
                state={taken.includes(row[1]) ? 'taken' : selected.includes(row[1]) ? 'selected' : 'free'}
                onToggle={onToggle}
              />
              <span className="w-6 text-center text-[11px] text-muted-foreground">{index + 1}</span>
              <SeatButton
                label={row[2]}
                state={taken.includes(row[2]) ? 'taken' : selected.includes(row[2]) ? 'selected' : 'free'}
                onToggle={onToggle}
              />
              <SeatButton
                label={row[3]}
                state={taken.includes(row[3]) ? 'taken' : selected.includes(row[3]) ? 'selected' : 'free'}
                onToggle={onToggle}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}