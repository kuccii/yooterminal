import React from 'react';
import { addMinutes, format, parseISO } from 'date-fns';
import { BusFront, CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import OperatorAvatar from '@/components/OperatorAvatar';
import { Badge } from '@/components/ui/badge';
import { formatDateFull, formatDuration, formatMoney } from '@/lib/format';

function Field({ label, value, sub }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function ETicket({ booking, operator, label = null, amountLabel = 'Amount paid' }) {
  const departure = parseISO(`${booking.travel_date}T${booking.departure_time}:00`);
  const arrival = addMinutes(departure, booking.duration_minutes || 0);
  const nextDay = format(arrival, 'yyyy-MM-dd') !== booking.travel_date;
  const cancelled = booking.status === 'cancelled';

  return (
    <div className={`overflow-hidden rounded-3xl border bg-card shadow-sm ${cancelled ? 'border-destructive/40' : 'border-border'}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${cancelled ? 'bg-destructive' : 'bg-primary'}`}>
        <span className="flex items-center gap-2 font-display text-lg font-extrabold text-white">
          <BusFront className="h-5 w-5" />
          {label && <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">{label}</span>}
          {booking.origin_city} → {booking.destination_city}
        </span>
        <Badge className="rounded-full bg-white/20 text-white hover:bg-white/20">
          {cancelled ? 'Cancelled' : 'Confirmed'}
        </Badge>
      </div>

      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <OperatorAvatar name={booking.operator_name} color={operator?.brand_color} size="lg" />
            <div>
              <p className="font-display text-base font-bold">{booking.operator_name}</p>
              <p className="text-xs text-muted-foreground">{booking.bus_class} coach</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Booking reference</p>
            <p className="font-mono text-xl font-bold tracking-[0.2em]">{booking.booking_ref}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            icon={CalendarDays}
            label="Travel date"
            value={formatDateFull(booking.travel_date)}
          />
          <Field
            label="Departs"
            value={booking.departure_time}
            sub={format(departure, 'EEE d MMM')}
          />
          <Field
            label="Arrives"
            value={format(arrival, 'HH:mm')}
            sub={`${formatDuration(booking.duration_minutes)}${nextDay ? ' · next day' : ''}`}
          />
          <Field label="Seats" value={(booking.seats || []).join(', ')} sub={`${booking.passenger_count} passenger${booking.passenger_count === 1 ? '' : 's'}`} />
        </div>

        <div className="relative my-6 border-t border-dashed border-border">
          <span className="absolute -left-9 -top-3 h-6 w-6 rounded-full bg-background" />
          <span className="absolute -right-9 -top-3 h-6 w-6 rounded-full bg-background" />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Passengers
            </p>
            <ul className="mt-2 space-y-2">
              {(booking.passengers || []).map((passenger) => (
                <li key={passenger.seat} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{passenger.name}</span>
                  <span className="text-muted-foreground">Seat {passenger.seat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> Boarding point
            </p>
            <p className="mt-2 text-sm font-medium">{operator?.name || booking.operator_name} — {booking.origin_city} bus park</p>
            <p className="mt-1 text-xs text-muted-foreground">Arrive 30 minutes before departure with this ticket.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{amountLabel}</p>
            <p className="font-display text-xl font-extrabold">{formatMoney(booking.amount, booking.currency)}</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Paid with {booking.payment_provider === 'flutterwave' ? 'Flutterwave' : booking.payment_provider}</p>
            {booking.payment_ref && <p>Ref {booking.payment_ref}</p>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-secondary/70 px-6 py-3 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Show this ticket on your phone or printed — the conductor scans the reference at boarding.
      </div>
    </div>
  );
}