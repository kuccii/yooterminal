import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import OperatorAvatar from '@/components/OperatorAvatar';
import { formatDuration, formatMoney } from '@/lib/format';

export default function TripCard({ trip, operator, seatsAvailable, passengers = 1, selectable = true }) {
  const schedule = trip.schedule;
  const [params] = useSearchParams();
  const detailParams = new URLSearchParams({ passengers: String(passengers) });
  const returnDate = params.get('return_date');
  if (returnDate) detailParams.set('return_date', returnDate);
  if (params.get('returning') === '1') detailParams.set('returning', '1');

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-4">
        <OperatorAvatar name={schedule.operator_name} color={operator?.brand_color} />

        <div className="min-w-[150px] flex-1">
          <p className="flex items-baseline gap-2 font-display text-xl font-extrabold tracking-tight">
            {trip.departureLabel}
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            {trip.arrivalLabel}
            {trip.nextDay && <sup className="text-[10px] font-bold text-primary">+1</sup>}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(schedule.duration_minutes)} · {schedule.origin_city} → {schedule.destination_city}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="rounded-full font-medium">
              {schedule.bus_class}
            </Badge>
            {(schedule.amenities || []).slice(0, 3).map((amenity) => (
              <span key={amenity} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {amenity}
              </span>
            ))}
          </div>
        </div>

        <div className="text-right">
          <p className="font-display text-xl font-extrabold">{formatMoney(trip.price ?? schedule.price, schedule.currency)}</p>
          <p className="text-[11px] text-muted-foreground">
            {trip.peakSurcharge ? `Peak fare · +${trip.peakSurcharge}%` : 'per passenger'}
          </p>
        </div>

        {selectable ? (
          <Button asChild className="rounded-xl">
            <Link to={`/trip/${encodeURIComponent(trip.key)}?${detailParams.toString()}`}>Select seats</Link>
          </Button>
        ) : (
          <span className="rounded-xl border border-dashed border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground">
            Pick your outbound trip first
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2 text-xs">
        <Link
          to={`/operator/${schedule.operator_slug}`}
          className="font-medium text-muted-foreground transition hover:text-primary"
        >
          {schedule.operator_name}
        </Link>
        <span className={seatsAvailable <= 6 ? 'font-semibold text-destructive' : 'text-muted-foreground'}>
          {seatsAvailable <= 6 ? `Only ${seatsAvailable} seats left` : `${seatsAvailable} seats available`}
        </span>
      </div>
    </article>
  );
}