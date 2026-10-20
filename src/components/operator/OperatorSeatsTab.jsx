import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import db from '@/api/client';
import SeatMap from '@/components/SeatMap';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tripKeyOf } from '@/lib/trips';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function OperatorSeatsTab({ operator, routes = [] }) {
  const [travelDate, setTravelDate] = useState(todayISO);
  const [schedules, setSchedules] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [picked, setPicked] = useState('');
  const [state, setState] = useState({ loading: false, taken: [], blocked: [], error: '', saving: false });

  const routeName = useCallback(
    (slug) => {
      const route = routes.find((entry) => entry.slug === slug);
      if (!route) return slug;
      return `${route.origin_city || route.origin_slug} → ${route.destination_city || route.destination_slug}`;
    },
    [routes],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const page = await db.entities.Schedule.filter(
          { operator_slug: operator.slug, active: 1 },
          { sort: 'departure_time', limit: 200 },
        );
        if (!active) return;
        const list = page.items || [];
        setSchedules(list);
        setPicked(list.length ? `${list[0].route_slug}~${list[0].departure_time}` : '');
      } catch (error) {
        if (active) setState((previous) => ({ ...previous, error: error.message }));
      } finally {
        if (active) setLoadingSchedules(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [operator.slug]);

  const schedule = useMemo(() => {
    const [routeSlug, departureTime] = String(picked || '').split('~');
    return schedules.find((entry) => entry.route_slug === routeSlug && entry.departure_time === departureTime) || null;
  }, [picked, schedules]);

  const tripKey = schedule
    ? tripKeyOf(schedule.route_slug, schedule.operator_slug, schedule.departure_time, travelDate)
    : '';

  const load = useCallback(async () => {
    if (!schedule) return;
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const [takenPage, blockedPage] = await Promise.all([
        db.seats.taken(tripKey, travelDate),
        db.seats.blocked(tripKey, travelDate),
      ]);
      setState({
        loading: false,
        saving: false,
        taken: Array.isArray(takenPage?.seats) ? takenPage.seats.map(String) : [],
        blocked: blockedPage?.items || [],
        error: '',
      });
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, saving: false, error: error.message }));
    }
  }, [schedule, tripKey, travelDate]);

  useEffect(() => {
    if (schedule) load();
  }, [schedule, load]);

  const blockedLabels = useMemo(
    () => state.blocked.map((row) => String(row.seat_label)),
    [state.blocked],
  );

  const soldLabels = useMemo(
    () => state.taken.filter((label) => !blockedLabels.includes(label)),
    [state.taken, blockedLabels],
  );

  async function toggleSeat(label) {
    if (!schedule || state.saving) return;
    const key = String(label);
    const existing = state.blocked.find((row) => String(row.seat_label) === key);
    setState((previous) => ({ ...previous, saving: true, error: '' }));
    try {
      if (existing) {
        await db.seats.unblock(existing.id);
      } else {
        await db.seats.block({ tripKey, travelDate, seatLabel: key });
      }
      await load();
    } catch (error) {
      setState((previous) => ({ ...previous, saving: false, error: error.message }));
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-extrabold">Seat control</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Block a seat to take it off sale, then release it when it becomes available again.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={!schedule || state.loading}>
            <RotateCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="seat-travel-date">Travel date</Label>
            <Input
              id="seat-travel-date"
              type="date"
              value={travelDate}
              min={todayISO()}
              onChange={(event) => setTravelDate(event.target.value || todayISO())}
            />
          </div>
          <div className="space-y-2">
            <Label>Departure</Label>
            <Select value={picked} onValueChange={setPicked} disabled={loadingSchedules || !schedules.length}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a departure" />
              </SelectTrigger>
              <SelectContent>
                {schedules.map((entry) => (
                  <SelectItem key={`${entry.route_slug}~${entry.departure_time}`} value={`${entry.route_slug}~${entry.departure_time}`}>
                    {routeName(entry.route_slug)} · {entry.departure_time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {state.error && (
          <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{state.error}</p>
        )}
      </Card>

      {!loadingSchedules && !schedules.length ? (
        <Card className="rounded-3xl border-border p-8 text-center text-sm text-muted-foreground">
          Add departures in Timetable &amp; fares first, then you can block seats here.
        </Card>
      ) : schedule ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="rounded-3xl border-border p-4 shadow-sm">
            <SeatMap
              total={Number(schedule.seats_total) || 0}
              layout={schedule.seat_layout || '2x2'}
              taken={soldLabels}
              blocked={blockedLabels}
              onToggle={toggleSeat}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Click a free seat to block it, or a blocked seat to release it. Sold seats cannot be blocked.
            </p>
          </Card>

          <Card className="rounded-3xl border-border p-6 shadow-sm">
            <h4 className="font-display text-base font-extrabold">Blocked seats</h4>
            {state.blocked.length ? (
              <ul className="mt-3 space-y-2">
                {state.blocked.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">Seat {row.seat_label}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => toggleSeat(row.seat_label)}>
                      Release
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No seats are blocked on this departure.</p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              {soldLabels.length} sold · {blockedLabels.length} blocked ·{' '}
              {Math.max((Number(schedule.seats_total) || 0) - state.taken.length, 0)} available
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
