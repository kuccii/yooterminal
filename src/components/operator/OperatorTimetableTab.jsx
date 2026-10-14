import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

import AmenityPicker from '@/components/manage/AmenityPicker';
import FormField from '@/components/manage/FormField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney, todayISO } from '@/lib/format';
import { SEAT_LAYOUTS, buildTrip } from '@/lib/trips';

const EMPTY = {
  route_slug: '',
  departure_time: '06:00',
  duration_hours: '',
  price: '',
  currency: 'UGX',
  peak_surcharge_percent: '0',
  bus_class: 'Standard',
  seats_total: '',
  seat_layout: '2x2',
  bus_plate: 'none',
  amenities: [],
  active: true,
};

const TIME_NOW = todayISO();

export default function OperatorTimetableTab({ operator, routes }) {
  const [schedules, setSchedules] = useState([]);
  const [buses, setBuses] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [schedulePage, busPage] = await Promise.all([
      db.entities.Schedule.filter(
        { operator_slug: operator.slug },
        { sort: 'departure_time', limit: 200 }
      ),
      db.entities.Bus.filter({ operator_slug: operator.slug }, { sort: 'plate', limit: 200 }),
    ]);
    setSchedules(schedulePage.items || []);
    setBuses(busPage.items || []);
  }, [operator.slug]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (schedule) => {
    setEditing(schedule || {});
    setForm(
      schedule
        ? {
            route_slug: schedule.route_slug,
            departure_time: schedule.departure_time,
            duration_hours: schedule.duration_minutes ? String(schedule.duration_minutes / 60) : '',
            price: schedule.price ? String(schedule.price) : '',
            currency: schedule.currency || 'UGX',
            peak_surcharge_percent: String(schedule.peak_surcharge_percent || 0),
            bus_class: schedule.bus_class || 'Standard',
            seats_total: schedule.seats_total ? String(schedule.seats_total) : '',
            seat_layout: schedule.seat_layout || '2x2',
            bus_plate: schedule.bus_plate || 'none',
            amenities: schedule.amenities || [],
            active: schedule.active !== false,
          }
        : EMPTY
    );
  };

  const pickRoute = (slug) => {
    const route = routes.find((entry) => entry.slug === slug);
    setForm((previous) => ({
      ...previous,
      route_slug: slug,
      duration_hours: route?.duration_minutes ? String(route.duration_minutes / 60) : previous.duration_hours,
      currency: route?.currency || previous.currency,
    }));
  };

  const pickBus = (plate) => {
    const bus = buses.find((entry) => entry.plate === plate);
    setForm((previous) => ({
      ...previous,
      bus_plate: plate,
      seats_total: bus?.seats_total ? String(bus.seats_total) : previous.seats_total,
      seat_layout: bus?.seat_layout || previous.seat_layout,
      bus_class: bus?.bus_class || previous.bus_class,
      amenities: bus?.amenities?.length ? bus.amenities : previous.amenities,
    }));
  };

  const save = async () => {
    const route = routes.find((entry) => entry.slug === form.route_slug);
    if (!route) return;
    setBusy(true);
    const payload = {
      route_slug: route.slug,
      origin_city: route.origin_city,
      destination_city: route.destination_city,
      operator_name: operator.name,
      operator_slug: operator.slug,
      owner_email: operator.owner_email || '',
      operator_status: operator.status || 'approved',
      departure_time: form.departure_time,
      duration_minutes: Math.round((Number(form.duration_hours) || 0) * 60),
      price: Number(form.price) || 0,
      currency: form.currency,
      peak_surcharge_percent: Number(form.peak_surcharge_percent) || 0,
      bus_class: form.bus_class,
      seats_total: Number(form.seats_total) || 0,
      seat_layout: form.seat_layout,
      bus_plate: form.bus_plate === 'none' ? '' : form.bus_plate,
      amenities: form.amenities,
      active: form.active,
    };
    if (editing?.id) {
      await db.entities.Schedule.update(editing.id, payload);
    } else {
      await db.entities.Schedule.create(payload);
    }
    setBusy(false);
    setEditing(null);
    await load();
  };

  const remove = async (schedule) => {
    if (!window.confirm(`Remove the ${schedule.departure_time} departure on ${schedule.origin_city} → ${schedule.destination_city}?`)) {
      return;
    }
    await db.entities.Schedule.delete(schedule.id);
    await load();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Departures, stops and fares</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {schedules.length} departure{schedules.length === 1 ? '' : 's'} on sale. Peak pricing adds a surcharge on
            Friday, Saturday and Sunday fares.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => openEditor(null)}>
          Add departure
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Times</TableHead>
              <TableHead>Coach</TableHead>
              <TableHead>Fare</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => {
              const trip = buildTrip(schedule, TIME_NOW);
              return (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <p className="font-semibold">
                      {schedule.origin_city} → {schedule.destination_city}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {schedule.bus_plate || 'No bus assigned'} · {schedule.seat_layout || '2x2'} layout ·{' '}
                      {schedule.seats_total || 0} seats
                      {schedule.active === false ? ' · off sale' : ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {trip.departureLabel} → {trip.arrivalLabel}
                      {trip.nextDay ? ' +1' : ''}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{schedule.bus_class}</TableCell>
                  <TableCell className="text-sm">
                    {formatMoney(schedule.price, schedule.currency)}
                    {schedule.peak_surcharge_percent ? (
                      <span className="block text-xs text-muted-foreground">
                        +{schedule.peak_surcharge_percent}% peak
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditor(schedule)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(schedule)}>
                        Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!schedules.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  No departures yet. Add one to put it on sale.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit departure' : 'New departure'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Route" className="sm:col-span-2">
              <Select value={form.route_slug} onValueChange={pickRoute}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a route" />
                </SelectTrigger>
                <SelectContent>
                  {routes.map((route) => (
                    <SelectItem key={route.slug} value={route.slug}>
                      {route.origin_city} → {route.destination_city}
                      {route.crossing_border ? ' · cross-border' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Departs">
              <Input
                type="time"
                value={form.departure_time}
                onChange={(event) => setForm({ ...form, departure_time: event.target.value })}
              />
            </FormField>

            <FormField label="Journey time (hours)">
              <Input
                type="number"
                step="0.5"
                value={form.duration_hours}
                onChange={(event) => setForm({ ...form, duration_hours: event.target.value })}
              />
            </FormField>

            <FormField label="Fare per seat">
              <Input
                type="number"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </FormField>

            <FormField label="Currency">
              <Select value={form.currency} onValueChange={(value) => setForm({ ...form, currency: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UGX">UGX</SelectItem>
                  <SelectItem value="RWF">RWF</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Peak surcharge (%)" hint="Added to the fare on Friday, Saturday and Sunday.">
              <Input
                type="number"
                value={form.peak_surcharge_percent}
                onChange={(event) => setForm({ ...form, peak_surcharge_percent: event.target.value })}
              />
            </FormField>

            <FormField label="Coach from the fleet" hint="Fills in the seat count, layout and comfort.">
              <Select value={form.bus_plate} onValueChange={pickBus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No bus assigned</SelectItem>
                  {buses.map((bus) => (
                    <SelectItem key={bus.id} value={bus.plate}>
                      {bus.plate} · {bus.bus_class} · {bus.seats_total} seats
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Class">
              <Select value={form.bus_class} onValueChange={(value) => setForm({ ...form, bus_class: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="Executive">Executive</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Seats on sale">
              <Input
                type="number"
                value={form.seats_total}
                onChange={(event) => setForm({ ...form, seats_total: event.target.value })}
              />
            </FormField>

            <FormField label="Seat layout">
              <Select value={form.seat_layout} onValueChange={(value) => setForm({ ...form, seat_layout: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEAT_LAYOUTS.map((layout) => (
                    <SelectItem key={layout.id} value={layout.id}>
                      {layout.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Onboard comfort">
            <AmenityPicker value={form.amenities} onChange={(amenities) => setForm({ ...form, amenities })} />
          </FormField>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <span className="text-sm font-medium">On sale on BusLink</span>
            <Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.route_slug || !form.price}>
              {busy ? 'Saving…' : 'Save departure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}