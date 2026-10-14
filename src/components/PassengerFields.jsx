import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PassengerFields({ seats, passengers, onChange }) {
  return (
    <div className="space-y-4">
      {seats.map((seat, index) => (
        <div key={seat} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full font-semibold">
              Seat {seat}
            </Badge>
            <span className="text-xs text-muted-foreground">Passenger {index + 1}</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`name-${seat}`} className="text-xs font-semibold text-muted-foreground">
                Full name
              </Label>
              <Input
                id={`name-${seat}`}
                className="mt-1"
                placeholder="As written on their ID"
                value={passengers[seat]?.name || ''}
                onChange={(event) => onChange(seat, 'name', event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`phone-${seat}`} className="text-xs font-semibold text-muted-foreground">
                Mobile number
              </Label>
              <Input
                id={`phone-${seat}`}
                className="mt-1"
                placeholder="+256 700 000 000"
                value={passengers[seat]?.phone || ''}
                onChange={(event) => onChange(seat, 'phone', event.target.value)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}