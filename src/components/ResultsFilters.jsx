import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { TIME_WINDOWS } from '@/lib/trips';
import { formatMoney } from '@/lib/format';

function Group({ title, children }) {
  return (
    <div className="py-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

function Option({ id, label, suffix, checked, onToggle }) {
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle(id)} />
      <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal">
        {label}
        {suffix && <span className="ml-1.5 text-xs text-muted-foreground">{suffix}</span>}
      </Label>
    </div>
  );
}

export default function ResultsFilters({ facets, filters, onChange, currency, onClear }) {
  const toggle = (key, value) =>
    onChange({
      ...filters,
      [key]: filters[key].includes(value) ? filters[key].filter((item) => item !== value) : [...filters[key], value],
    });

  const priceRange = facets.price;
  const active = filters.windows.length || filters.operators.length || filters.classes.length || filters.maxPrice;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold">Filters</h2>
        {active ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear}>
            Clear all
          </Button>
        ) : null}
      </div>

      <Separator className="mt-3" />

      <Group title="Departure time">
        {TIME_WINDOWS.map((window) => (
          <Option
            key={window.id}
            id={`window-${window.id}`}
            label={window.label}
            checked={filters.windows.includes(window.id)}
            onToggle={(id) => toggle('windows', id.replace('window-', ''))}
          />
        ))}
      </Group>

      {facets.operators.length > 0 && (
        <>
          <Separator />
          <Group title="Bus company">
            {facets.operators.map((operator) => (
              <Option
                key={operator}
                id={`operator-${operator}`}
                label={operator}
                checked={filters.operators.includes(operator)}
                onToggle={(id) => toggle('operators', id.replace('operator-', ''))}
              />
            ))}
          </Group>
        </>
      )}

      {facets.classes.length > 0 && (
        <>
          <Separator />
          <Group title="Coach class">
            {facets.classes.map((busClass) => (
              <Option
                key={busClass}
                id={`class-${busClass}`}
                label={busClass}
                checked={filters.classes.includes(busClass)}
                onToggle={(id) => toggle('classes', id.replace('class-', ''))}
              />
            ))}
          </Group>
        </>
      )}

      {priceRange && priceRange.max > priceRange.min && (
        <>
          <Separator />
          <div className="py-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Maximum price</h3>
            <Slider
              className="mt-4"
              min={priceRange.min}
              max={priceRange.max}
              step={Math.max(Math.round((priceRange.max - priceRange.min) / 20), 1)}
              value={[filters.maxPrice ?? priceRange.max]}
              onValueChange={([value]) => onChange({ ...filters, maxPrice: value >= priceRange.max ? null : value })}
            />
            <p className="mt-2 text-sm font-semibold">
              up to {formatMoney(filters.maxPrice ?? priceRange.max, currency)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}