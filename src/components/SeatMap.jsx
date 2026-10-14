import React from 'react';
import { seatRows } from '@/lib/trips';
import { cn } from '@/lib/utils';

function SeatButton({ label, state, onToggle }) {
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

function seatState(label, taken, selected) {
  if (taken.includes(label)) return 'taken';
  if (selected.includes(label)) return 'selected';
  return 'free';
}

function SeatPair({ labels, taken, selected, onToggle }) {
  return labels.map((label) => (
    <SeatButton key={label} label={label} state={seatState(label, taken, selected)} onToggle={onToggle} />
  ));
}

function SeatRow({ row, taken, selected, onToggle }) {
  if (row.length === 5) {
    // Rear bench: 2 | 1 | 2 across the full width of the coach.
    return (
      <div className="flex items-center justify-center gap-1.5">
        <SeatPair labels={row.slice(0, 2)} taken={taken} selected={selected} onToggle={onToggle} />
        <SeatButton
          label={row[2]}
          state={seatState(row[2], taken, selected)}
          onToggle={onToggle}
        />
        <SeatPair labels={row.slice(3)} taken={taken} selected={selected} onToggle={onToggle} />
      </div>
    );
  }
  if (row.length === 4) {
    // Standard row: pair | aisle | pair.
    return (
      <div className="flex items-center justify-center gap-2">
        <SeatPair labels={row.slice(0, 2)} taken={taken} selected={selected} onToggle={onToggle} />
        <span className="w-6" aria-hidden="true" />
        <SeatPair labels={row.slice(2)} taken={taken} selected={selected} onToggle={onToggle} />
      </div>
    );
  }
  // Short last row (or 2+1 layout): center the seats.
  return (
    <div className="flex items-center justify-center gap-2">
      <SeatPair labels={row} taken={taken} selected={selected} onToggle={onToggle} />
    </div>
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

      <div className="mx-auto w-full max-w-[300px]">
        <div className="mb-3 rounded-lg bg-muted py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Front · Driver
        </div>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <SeatRow key={index} row={row} taken={taken} selected={selected} onToggle={onToggle} />
          ))}
        </div>
      </div>
    </div>
  );
}
