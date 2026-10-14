import db from '@/api/client';

import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import FormField from '@/components/manage/FormField';
import { formatDuration, formatMoney } from '@/lib/format';
import { IMAGES } from '@/lib/images';

const EMPTY = {
  slug: '',
  origin_slug: '',
  destination_slug: '',
  duration_hours: '',
  distance_km: '',
  currency: 'UGX',
  from_price: '',
  crossing_border: false,
  border_post: '',
  popular: false,
  stops: '',
  description: '',
  image_url: '',
};

export default function AdminRoutesTab({ routes, cities, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const openEditor = (route) => {
    setEditing(route || { slug: '' });
    setForm(
      route
        ? {
            slug: route.slug,
            origin_slug: route.origin_slug,
            destination_slug: route.destination_slug,
            duration_hours: route.duration_minutes ? String(route.duration_minutes / 60) : '',
            distance_km: route.distance_km ? String(route.distance_km) : '',
            currency: route.currency || 'UGX',
            from_price: route.from_price ? String(route.from_price) : '',
            crossing_border: Boolean(route.crossing_border),
            border_post: route.border_post || '',
            popular: Boolean(route.popular),
            stops: (route.stops || []).join('\n'),
            description: route.description || '',
            image_url: route.image_url || '',
          }
        : EMPTY
    );
  };

  const save = async () => {
    setBusy(true);
    const origin = cities.find((city) => city.slug === form.origin_slug);
    const destination = cities.find((city) => city.slug === form.destination_slug);
    const payload = {
      slug: form.slug || `${form.origin_slug}-${form.destination_slug}`,
      origin_city: origin?.name || '',
      destination_city: destination?.name || '',
      origin_slug: form.origin_slug,
      destination_slug: form.destination_slug,
      distance_km: Number(form.distance_km) || 0,
      duration_minutes: Math.round((Number(form.duration_hours) || 0) * 60),
      crossing_border: form.crossing_border,
      border_post: form.border_post.trim(),
      stops: form.stops
        .split('\n')
        .map((stop) => stop.trim())
        .filter(Boolean),
      description: form.description.trim(),
      image_url: form.image_url.trim() || IMAGES.busRoad,
      from_price: Number(form.from_price) || 0,
      currency: form.currency,
      popular: form.popular,
    };

    if (editing?.id) {
      await db.entities.Route.update(editing.id, payload);
    } else {
      await db.entities.Route.create(payload);
    }
    setBusy(false);
    setEditing(null);
    await onChanged();
  };

  const remove = async (route) => {
    if (!window.confirm(`Remove ${route.origin_city} → ${route.destination_city}? Departures on it stay in the database.`)) {
      return;
    }
    await db.entities.Route.delete(route.id);
    await onChanged();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Routes, stops and border posts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The platform owns the route catalogue. Operators add their departures and fares to these routes.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => openEditor(null)}>
          Add route
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Journey</TableHead>
              <TableHead>Stops</TableHead>
              <TableHead>From</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => (
              <TableRow key={route.id}>
                <TableCell>
                  <p className="font-semibold">
                    {route.origin_city} → {route.destination_city}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {route.crossing_border ? `Cross-border${route.border_post ? ` · ${route.border_post}` : ''}` : 'Domestic'}
                    {route.popular ? ' · featured' : ''}
                  </p>
                </TableCell>
                <TableCell className="text-sm">
                  {formatDuration(route.duration_minutes)}
                  {route.distance_km ? ` · ${route.distance_km} km` : ''}
                </TableCell>
                <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                  {(route.stops || []).join(' · ') || '—'}
                </TableCell>
                <TableCell className="text-sm">
                  {route.from_price ? formatMoney(route.from_price, route.currency) : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => openEditor(route)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => remove(route)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit route' : 'New route'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Origin terminal">
              <Select
                value={form.origin_slug}
                onValueChange={(value) =>
                  setForm({ ...form, origin_slug: value, slug: `${value}-${form.destination_slug}` })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a city" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.slug} value={city.slug}>
                      {city.name} · {city.country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Destination terminal">
              <Select
                value={form.destination_slug}
                onValueChange={(value) =>
                  setForm({ ...form, destination_slug: value, slug: `${form.origin_slug}-${value}` })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a city" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.slug} value={city.slug}>
                      {city.name} · {city.country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Journey time (hours)">
              <Input
                type="number"
                step="0.5"
                value={form.duration_hours}
                onChange={(event) => setForm({ ...form, duration_hours: event.target.value })}
              />
            </FormField>

            <FormField label="Distance (km)">
              <Input
                type="number"
                value={form.distance_km}
                onChange={(event) => setForm({ ...form, distance_km: event.target.value })}
              />
            </FormField>

            <FormField label="From fare">
              <Input
                type="number"
                value={form.from_price}
                onChange={(event) => setForm({ ...form, from_price: event.target.value })}
              />
            </FormField>

            <FormField label="Currency">
              <Select value={form.currency} onValueChange={(value) => setForm({ ...form, currency: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UGX">UGX · Ugandan shilling</SelectItem>
                  <SelectItem value="RWF">RWF · Rwandan franc</SelectItem>
                  <SelectItem value="USD">USD · US dollar</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-sm font-medium">Crosses a border</span>
              <Switch
                checked={form.crossing_border}
                onCheckedChange={(checked) => setForm({ ...form, crossing_border: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-sm font-medium">Feature on the home page</span>
              <Switch checked={form.popular} onCheckedChange={(checked) => setForm({ ...form, popular: checked })} />
            </div>
          </div>

          {form.crossing_border && (
            <FormField label="Border post" hint="Shown to travellers on the route page, e.g. Katuna / Gatuna.">
              <Input
                value={form.border_post}
                onChange={(event) => setForm({ ...form, border_post: event.target.value })}
              />
            </FormField>
          )}

          <FormField label="Stops on the way" hint="One stop per line, in travel order.">
            <Textarea
              rows={4}
              value={form.stops}
              onChange={(event) => setForm({ ...form, stops: event.target.value })}
            />
          </FormField>

          <FormField label="Route description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </FormField>

          <FormField label="Photo URL" hint="Leave empty to use the standard coach photo.">
            <Input
              value={form.image_url}
              onChange={(event) => setForm({ ...form, image_url: event.target.value })}
            />
          </FormField>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.origin_slug || !form.destination_slug}>
              {busy ? 'Saving…' : 'Save route'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}