import React, { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export default function CityPicker({ cities = [], value, onChange, label, placeholder = 'Leaving from…' }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-secondary/70"
        >
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className={cn('block truncate text-sm font-semibold', !value && 'font-normal text-muted-foreground')}>
              {value?.name || placeholder}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search a city…" />
          <CommandList>
            <CommandEmpty>No city found.</CommandEmpty>
            <CommandGroup>
              {cities.map((city) => (
                <CommandItem
                  key={city.slug}
                  value={`${city.name} ${city.country}`}
                  onSelect={() => {
                    onChange(city);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value?.slug === city.slug ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1">{city.name}</span>
                  <span className="text-xs text-muted-foreground">{city.country}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}