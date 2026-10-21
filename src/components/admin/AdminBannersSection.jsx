import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import FormField from '@/components/manage/FormField';
import ImageField from '@/components/admin/ImageField';
import { IMAGES } from '@/lib/images';

const EMPTY = {
  title: '',
  subtitle: '',
  image_url: IMAGES.busRoad,
  cta_label: '',
  link_url: '/search',
  placement: 'home_strip',
  sort_order: 0,
  starts_at: '',
  ends_at: '',
  active: true,
};

export default function AdminBannersSection() {
  const [banners, setBanners] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const page = await db.entities.Banner.list({ sort: 'sort_order', limit: 50 });
    setBanners(page.items || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (banner) => {
    setEditing(banner || {});
    setError('');
    setForm(banner ? { ...EMPTY, ...banner } : EMPTY);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      image_url: form.image_url.trim(),
      cta_label: form.cta_label.trim(),
      link_url: form.link_url.trim(),
      placement: form.placement,
      sort_order: Number(form.sort_order) || 0,
      starts_at: form.starts_at || '',
      ends_at: form.ends_at || '',
      active: form.active,
    };
    try {
      if (editing?.id) {
        await db.entities.Banner.update(editing.id, payload);
      } else {
        await db.entities.Banner.create(payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err?.message || 'Could not save the banner.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (banner) => {
    await db.entities.Banner.update(banner.id, { active: !banner.active });
    await load();
  };

  const remove = async (banner) => {
    if (!window.confirm(`Delete the banner “${banner.title}”?`)) return;
    await db.entities.Banner.delete(banner.id);
    await load();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Promotional banners</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Shown on the home page under the search box. Point them at a route page or any link.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => openEditor(null)}>
          Add banner
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className="flex flex-wrap items-center gap-4 rounded-2xl border border-border p-3"
          >
            <div className="h-14 w-20 overflow-hidden rounded-lg bg-secondary">
              <Image src={banner.image_url || IMAGES.busRoad} alt={banner.title} className="h-14 w-20 object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{banner.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {banner.subtitle || 'No subtitle'} · {banner.placement.replace('_', ' ')} · {banner.link_url}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                banner.active ? 'bg-[hsl(var(--trust))] text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {banner.active ? 'live' : 'paused'}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggleActive(banner)}>
                {banner.active ? 'Pause' : 'Publish'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEditor(banner)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(banner)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
        {!banners.length && <p className="text-sm text-muted-foreground">No banners yet.</p>}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit banner' : 'New banner'}</DialogTitle>
          </DialogHeader>

          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <FormField label="Headline">
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </FormField>
            <FormField label="Supporting line">
              <Input value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} />
            </FormField>
            <ImageField
              label="Banner image"
              hint="Upload or pick a photo. Leave empty to hide the image."
              value={form.image_url}
              onChange={(value) => setForm({ ...form, image_url: value })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Button label">
                <Input
                  value={form.cta_label}
                  onChange={(event) => setForm({ ...form, cta_label: event.target.value })}
                />
              </FormField>
              <FormField label="Link" hint="An in-app path like /routes/kampala-kigali, or a full URL.">
                <Input value={form.link_url} onChange={(event) => setForm({ ...form, link_url: event.target.value })} />
              </FormField>
              <FormField label="Placement">
                <Select value={form.placement} onValueChange={(value) => setForm({ ...form, placement: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home_strip">Home page strip</SelectItem>
                    <SelectItem value="search_top">Search results top</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Sort order">
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
                />
              </FormField>
              <FormField label="Starts">
                <Input
                  type="date"
                  value={form.starts_at}
                  onChange={(event) => setForm({ ...form, starts_at: event.target.value })}
                />
              </FormField>
              <FormField label="Ends">
                <Input
                  type="date"
                  value={form.ends_at}
                  onChange={(event) => setForm({ ...form, ends_at: event.target.value })}
                />
              </FormField>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-sm font-medium">Live on the site</span>
              <Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.title.trim()}>
              {busy ? 'Saving…' : 'Save banner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}