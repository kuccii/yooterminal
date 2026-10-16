import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import FormField from '@/components/manage/FormField';

const EMPTY = {
  title: '',
  description: '',
  sort_order: 0,
  active: true,
};

export default function AdminFeaturesSection() {
  const [features, setFeatures] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const page = await db.entities.SiteFeature.list({ sort: 'sort_order', limit: 100 });
    setFeatures(page.items || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (feature) => {
    setEditing(feature || {});
    setForm(feature ? { ...EMPTY, ...feature, sort_order: Number(feature.sort_order) || 0 } : EMPTY);
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      title: form.title.trim(),
      description: String(form.description ?? '').trim(),
      sort_order: Number(form.sort_order) || 0,
      active: form.active,
    };
    try {
      if (editing?.id) {
        await db.entities.SiteFeature.update(editing.id, payload);
      } else {
        await db.entities.SiteFeature.create(payload);
      }
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (feature) => {
    await db.entities.SiteFeature.update(feature.id, { active: !feature.active });
    await load();
  };

  const remove = async (feature) => {
    if (!window.confirm(`Delete the feature “${feature.title}”?`)) return;
    await db.entities.SiteFeature.delete(feature.id);
    await load();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Why YooTerminal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The feature cards shown in the “Why book with us” strip on the home page.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => openEditor(null)}>
          Add feature
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {features.map((feature) => (
          <div
            key={feature.id}
            className="flex flex-wrap items-center gap-4 rounded-2xl border border-border p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{feature.title}</p>
              <p className="truncate text-xs text-muted-foreground">{feature.description}</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                feature.active ? 'bg-[hsl(var(--trust))] text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {feature.active ? 'live' : 'hidden'}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggleActive(feature)}>
                {feature.active ? 'Hide' : 'Show'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEditor(feature)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(feature)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
        {!features.length && <p className="text-sm text-muted-foreground">No features yet.</p>}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit feature' : 'New feature'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="Title">
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </FormField>
            <FormField label="Description">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </FormField>
            <FormField label="Sort order">
              <Input
                type="number"
                value={form.sort_order}
                onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
              />
            </FormField>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-sm font-medium">Shown on the site</span>
              <Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.title.trim()}>
              {busy ? 'Saving…' : 'Save feature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
