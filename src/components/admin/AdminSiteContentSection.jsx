import db from '@/api/client';

import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import FormField from '@/components/manage/FormField';
import ImageField from '@/components/admin/ImageField';
import { useSiteContent } from '@/lib/SiteContentContext';

const SCALAR_KEYS = [
  'hero_headline',
  'hero_sub',
  'hero_badge_payment',
  'hero_badge_ticket',
  'hero_image',
  'faq_heading',
  'trust_heading',
  'trust_rating_fallback',
  'trust_note',
  'operators_heading',
  'routes_heading',
  'countries_heading',
  'footer_tagline',
];

function toLinkRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'string')
    .map(([label, href]) => ({ label, href }));
}

function toCountryRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row.name === 'string')
    .map((row) => ({ name: row.name, image: typeof row.image === 'string' ? row.image : '' }));
}

function buildForm(content) {
  const form = {};
  for (const key of SCALAR_KEYS) form[key] = typeof content[key] === 'string' ? content[key] : '';
  form.countries = toCountryRows(content.countries);
  form.home_routes = Array.isArray(content.home_routes) ? content.home_routes.filter((slug) => typeof slug === 'string') : [];
  form.footer_routes = toLinkRows(content.footer_routes);
  form.footer_ug_cities = toLinkRows(content.footer_ug_cities);
  form.footer_rw_cities = toLinkRows(content.footer_rw_cities);
  return form;
}

function LinkGroup({ title, rows, onChange }) {
  const updateRow = (index, patch) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={row.label}
            placeholder="Label"
            onChange={(event) => updateRow(index, { label: event.target.value })}
          />
          <Input
            value={row.href}
            placeholder="/routes/…"
            onChange={(event) => updateRow(index, { href: event.target.value })}
          />
          <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(index)}>
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, { label: '', href: '' }])}>
        Add link
      </Button>
    </div>
  );
}

export default function AdminSiteContentSection() {
  const { content, refresh } = useSiteContent();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => buildForm(content));
  const [busy, setBusy] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [picker, setPicker] = useState('');

  const openEditor = () => {
    setForm(buildForm(content));
    setPicker('');
    setOpen(true);
    db.entities.Route
      .list({ sort: 'origin_city', limit: 200 })
      .then((page) => setRoutes(page.items || []))
      .catch(() => setRoutes([]));
  };

  const routeLabel = (slug) => {
    const route = routes.find((item) => item.slug === slug);
    return route ? `${route.origin_city} → ${route.destination_city}` : slug;
  };

  const moveRoute = (index, delta) => {
    const next = [...form.home_routes];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setValue('home_routes', next);
  };

  const addRoute = (slug) => {
    setPicker('');
    if (!slug || form.home_routes.includes(slug)) return;
    setValue('home_routes', [...form.home_routes, slug]);
  };

  const setValue = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setBusy(true);
    const payloadByKey = {};
    for (const key of SCALAR_KEYS) payloadByKey[key] = String(form[key] ?? '').trim();
    payloadByKey.home_routes = form.home_routes.filter((slug) => slug.trim());
    payloadByKey.countries = form.countries
      .filter((row) => row.name.trim())
      .map((row) => ({ name: row.name.trim(), image: row.image.trim() }));
    for (const key of ['footer_routes', 'footer_ug_cities', 'footer_rw_cities']) {
      payloadByKey[key] = form[key]
        .filter((row) => row.label.trim() && row.href.trim())
        .map((row) => [row.label.trim(), row.href.trim()]);
    }

    try {
      const page = await db.entities.SiteContent.list({ limit: 100 });
      const existing = new Map((page.items || []).map((row) => [row.key, row]));
      for (const [key, value] of Object.entries(payloadByKey)) {
        const row = existing.get(key);
        if (row) {
          if (JSON.stringify(row.value) !== JSON.stringify(value)) {
            await db.entities.SiteContent.update(row.id, { key, value });
          }
        } else {
          await db.entities.SiteContent.create({ key, value });
        }
      }
      await refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const countryCount = content.countries?.length || 0;
  const linkCount =
    (content.footer_routes?.length || 0) +
    (content.footer_ug_cities?.length || 0) +
    (content.footer_rw_cities?.length || 0);

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Site content</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Headline, section headings, footer links and images used across the public site.
          </p>
        </div>
        <Button className="rounded-xl" onClick={openEditor}>
          Edit site content
        </Button>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <p className="truncate text-muted-foreground">
          <span className="font-medium text-foreground">Hero:</span> {content.hero_headline}
        </p>
        <p className="truncate text-muted-foreground">
          <span className="font-medium text-foreground">Footer:</span> {content.footer_tagline}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Countries:</span> {countryCount} shown
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Top routes:</span>{' '}
          {content.home_routes?.length ? `${content.home_routes.length} picked` : 'popular routes'}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Footer links:</span> {linkCount}
        </p>
      </div>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit site content</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-4">
              <p className="font-display text-sm font-bold">Hero</p>
              <FormField label="Headline">
                <Input value={form.hero_headline} onChange={(event) => setValue('hero_headline', event.target.value)} />
              </FormField>
              <FormField label="Supporting text">
                <Textarea
                  rows={3}
                  value={form.hero_sub}
                  onChange={(event) => setValue('hero_sub', event.target.value)}
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Payment badge">
                  <Input
                    value={form.hero_badge_payment}
                    onChange={(event) => setValue('hero_badge_payment', event.target.value)}
                  />
                </FormField>
                <FormField label="Ticket badge">
                  <Input
                    value={form.hero_badge_ticket}
                    onChange={(event) => setValue('hero_badge_ticket', event.target.value)}
                  />
                </FormField>
              </div>
              <ImageField
                label="Hero image"
                value={form.hero_image}
                onChange={(value) => setValue('hero_image', value)}
              />
            </div>

            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <p className="font-display text-sm font-bold sm:col-span-2">Section headings</p>
              <FormField label="FAQ heading">
                <Input value={form.faq_heading} onChange={(event) => setValue('faq_heading', event.target.value)} />
              </FormField>
              <FormField label="Trust heading">
                <Input value={form.trust_heading} onChange={(event) => setValue('trust_heading', event.target.value)} />
              </FormField>
              <FormField label="Trust rating line" hint="Shown when there are not enough reviews yet.">
                <Input
                  value={form.trust_rating_fallback}
                  onChange={(event) => setValue('trust_rating_fallback', event.target.value)}
                />
              </FormField>
              <FormField label="Trust note">
                <Input value={form.trust_note} onChange={(event) => setValue('trust_note', event.target.value)} />
              </FormField>
              <FormField label="Operators heading">
                <Input
                  value={form.operators_heading}
                  onChange={(event) => setValue('operators_heading', event.target.value)}
                />
              </FormField>
              <FormField label="Top routes heading">
                <Input
                  value={form.routes_heading}
                  onChange={(event) => setValue('routes_heading', event.target.value)}
                />
              </FormField>
              <FormField label="Countries heading" className="sm:col-span-2">
                <Input
                  value={form.countries_heading}
                  onChange={(event) => setValue('countries_heading', event.target.value)}
                />
              </FormField>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <p className="font-display text-sm font-bold">Top travelled routes</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick the routes shown under the top routes heading, in display order. Leave empty to show every route
                  marked popular.
                </p>
              </div>
              {form.home_routes.map((slug, index) => (
                <div key={slug} className="flex items-center gap-2 rounded-xl border border-border p-2">
                  <span className="flex-1 truncate text-sm font-medium">{routeLabel(slug)}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => moveRoute(index, -1)}
                  >
                    Up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={index === form.home_routes.length - 1}
                    onClick={() => moveRoute(index, 1)}
                  >
                    Down
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setValue('home_routes', form.home_routes.filter((item) => item !== slug))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {!form.home_routes.length && (
                <p className="text-sm text-muted-foreground">No routes picked — showing popular routes.</p>
              )}
              <Select value={picker} onValueChange={addRoute}>
                <SelectTrigger>
                  <SelectValue placeholder="Add a route" />
                </SelectTrigger>
                <SelectContent>
                  {routes
                    .filter((route) => !form.home_routes.includes(route.slug))
                    .map((route) => (
                      <SelectItem key={route.slug} value={route.slug}>
                        {route.origin_city} → {route.destination_city}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <p className="font-display text-sm font-bold">Countries</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setValue('countries', [...form.countries, { name: '', image: '' }])}
                >
                  Add country
                </Button>
              </div>
              {form.countries.map((row, index) => (
                <div key={index} className="space-y-3 rounded-xl border border-border p-3">
                  <div className="flex gap-2">
                    <Input
                      value={row.name}
                      placeholder="Country name"
                      onChange={(event) =>
                        setValue(
                          'countries',
                          form.countries.map((item, i) =>
                            i === index ? { ...item, name: event.target.value } : item,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setValue('countries', form.countries.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                  <ImageField
                    label="Card image"
                    value={row.image}
                    onChange={(value) =>
                      setValue(
                        'countries',
                        form.countries.map((item, i) => (i === index ? { ...item, image: value } : item)),
                      )
                    }
                  />
                </div>
              ))}
              {!form.countries.length && <p className="text-sm text-muted-foreground">No countries yet.</p>}
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <p className="font-display text-sm font-bold">Footer</p>
              <FormField label="Tagline">
                <Textarea rows={2} value={form.footer_tagline} onChange={(event) => setValue('footer_tagline', event.target.value)} />
              </FormField>
              <LinkGroup
                title="Popular routes"
                rows={form.footer_routes}
                onChange={(rows) => setValue('footer_routes', rows)}
              />
              <LinkGroup
                title="Uganda cities"
                rows={form.footer_ug_cities}
                onChange={(rows) => setValue('footer_ug_cities', rows)}
              />
              <LinkGroup
                title="Rwanda cities"
                rows={form.footer_rw_cities}
                onChange={(rows) => setValue('footer_rw_cities', rows)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.hero_headline.trim()}>
              {busy ? 'Saving…' : 'Save content'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
