import React from 'react';
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import OperatorAvatar from '@/components/OperatorAvatar';
import { formatDateShort, formatDuration, formatMoney } from '@/lib/format';

function Row({ icon: Icon, children }) {
  return (
    <li className="flex items-start gap-2 text-sm text-muted-foreground">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

export default function TripSummary({
  operator,
  operatorName,
  operatorSlug,
  originCity,
  destinationCity,
  travelDate,
  departureLabel,
  arrivalLabel,
  nextDay,
  durationMinutes,
  busClass,
  seats = [],
  passengerCount,
  amount,
  currency,
  children,
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <OperatorAvatar name={operatorName} color={operator?.brand_color} />
        <div>
          <p className="font-display text-base font-bold">{operatorName}</p>
          <p className="text-xs text-muted-foreground">{busClass} coach</p>
        </div>
      </div>

      <p className="mt-4 font-display text-2xl font-extrabold tracking-tight">
        {originCity} → {destinationCity}
      </p>

      <ul className="mt-4 space-y-2">
        <Row icon={CalendarDays}>{formatDateShort(travelDate)}</Row>
        <Row icon={Clock}>
          {departureLabel} – {arrivalLabel}
          {nextDay && <span className="ml-1 text-xs font-semibold text-primary">(next day)</span>} ·{' '}
          {formatDuration(durationMinutes)}
        </Row>
        <Row icon={MapPin}>
          {seats.length ? `Seats ${seats.join(', ')}` : 'Seats to be chosen'}
        </Row>
        <Row icon={Users}>
          {passengerCount || seats.length || 1} {(passengerCount || seats.length || 1) === 1 ? 'passenger' : 'passengers'}
        </Row>
      </ul>

      {amount !== undefined && amount !== null && (
        <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
          <span className="text-sm font-medium text-muted-foreground">Total to pay</span>
          <span className="font-display text-2xl font-extrabold">{formatMoney(amount, currency)}</span>
        </div>
      )}

      {children}
    </div>
  );
}