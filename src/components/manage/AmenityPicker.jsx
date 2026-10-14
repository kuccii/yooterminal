import React from 'react';
import { cn } from '@/lib/utils';

export const AMENITY_OPTIONS = [
  'Air conditioning',
  'Wi-Fi',
  'USB charging',
  'Reclining seats',
  'Extra legroom',
  'Refreshments',
  'Onboard washroom',
  '2 bags included',
];

export default function AmenityPicker({ value = [], onChange }) {
  const toggle = (item) =>
    onChange(value.includes(item) ? value.filter((entry) => entry !== item) : [...value, item]);

  return (
    <div className="flex flex-wrap gap-1.5">
      {AMENITY_OPTIONS.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => toggle(item)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition',
            value.includes(item)
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary'
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}