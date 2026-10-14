import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bus } from 'lucide-react';

import AmenityPicker from '@/components/manage/AmenityPicker';
import FormField from '@/components/manage/FormField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SEAT_LAYOUTS } from '@/lib/trips';

const EMPTY = {
  plate: '',
  model: '',
  bus_class: 'Standard',
  seats_total: '',
  seat_layout: '2x2',
  amenities: [],
  status: 'active',
  notes: '',
};

export default function OperatorFleetTab({ operator }) {
  const [buses, setBuses] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const page = await db.entities.Bus.filter({ operator_slug: operator.slug }, { sort: 'plate', limit: 200 });
    setBuses(page.items || []);
  }, [operator.slug]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (bus) => {
    setEditing(bus || {});
    setForm(
      bus
        ? {
            plate: bus.plate || '',
            model: bus.model || '',
            bus_class: bus.bus_class || 'Standard',
            seats_total: bus.seats_total ? String(bus.seats_total) : '',
            seat_layout: bus.seat_layout || '2x2',
            amenities: bus.amenities || [],
            status: bus.status || 'active',
            notes: bus.notes || '',
          }
        : EMPTY
    );
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      operator_slug: operator.slug,
      operator_name: operator.name,
      owner_email: operator.owner_email || '',
      plate: form.plate.trim().toUpperCase(),
      model: form.model.trim(),
      bus_class: form.bus_class,
      seats_total: Number(form.seats_total) || 0,
      seat_layout: form.seat_layout,
      amenities: form.amenities,
      status: form.status,
      notes: form.notes.trim(),
    };
    if (editing?.id) {
      await db.entities.Bus.update(editing.id, payload);
    } else {
      await db.entities.Bus.create(payload);
    }
    setBusy(false);
    setEditing(null);
    await load();
  };

  const remove = async (bus) => {
    if (!window.confirm(`Remove ${bus.plate} from the fleet?`)) return;
    await db.entities.Bus.delete(bus.id);
    await load();
  };

  const capacity = buses
    .filter((bus) => bus.status !== 'maintenance')
    .reduce((total, bus) => total + (Number(bus.seats_total) || 0), 0);

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Fleet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {buses.length} coach{buses.length === 1 ? '' : 'es'} registered · {capacity.toLocaleString('en-US')} seats
            ready to sell
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => openEditor(null)}>
          Add bus
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bus</TableHead>
              <TableHead>Layout</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Comfort</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buses.map((bus) => (
              <TableRow key={bus.id}>
                <TableCell>
                  <p className="flex items-center gap-2 font-semibold">
                    <Bus className="h-4 w-4 text-primary" /> {bus.plate}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bus.model || 'No model'} · {bus.bus_class}
                    {bus.status === 'maintenance' ? ' · in maintenance' : ''}
                  </p>
                </TableCell>
                <TableCell className="text-sm">{bus.seat_layout || '2x2'}</TableCell>
                <TableCell className="text-sm">{bus.seats_total || 0}</TableCell>
                <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                  {(bus.amenities || []).join(' · ') || '—'}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEditor(bus)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(bus)}>
                      Remove
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!buses.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  No coaches yet. Add your first bus to start scheduling departures.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit bus' : 'New bus'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Number plate">
              <Input
                value={form.plate}
                onChange={(event) => setForm({ ...form, plate: event.target.value.toUpperCase() })}
              />
            </FormField>
            <FormField label="Make and model">
              <Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
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
            <FormField label="Seats">
              <Input
                type="number"
                value={form.seats_total}
                onChange={(event) => setForm({ ...form, seats_total: event.target.value })}
              />
            </FormField>
            <FormField label="Seat layout" hint="How the seat map is drawn for this coach.">
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
            <FormField label="Availability">
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">In service</SelectItem>
                  <SelectItem value="maintenance">In maintenance</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label="Onboard comfort">
            <AmenityPicker value={form.amenities} onChange={(amenities) => setForm({ ...form, amenities })} />
          </FormField>

          <FormField label="Internal notes">
            <Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </FormField>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.plate.trim()}>
              {busy ? 'Saving…' : 'Save bus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}