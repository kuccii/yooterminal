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
  question: '',
  answer: '',
  sort_order: 0,
  active: true,
};

export default function AdminFaqsSection() {
  const [faqs, setFaqs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const page = await db.entities.SiteFaq.list({ sort: 'sort_order', limit: 100 });
    setFaqs(page.items || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (faq) => {
    setEditing(faq || {});
    setForm(faq ? { ...EMPTY, ...faq, sort_order: Number(faq.sort_order) || 0 } : EMPTY);
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      question: form.question.trim(),
      answer: String(form.answer ?? '').trim(),
      sort_order: Number(form.sort_order) || 0,
      active: form.active,
    };
    try {
      if (editing?.id) {
        await db.entities.SiteFaq.update(editing.id, payload);
      } else {
        await db.entities.SiteFaq.create(payload);
      }
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (faq) => {
    await db.entities.SiteFaq.update(faq.id, { active: !faq.active });
    await load();
  };

  const remove = async (faq) => {
    if (!window.confirm(`Delete the question “${faq.question}”?`)) return;
    await db.entities.SiteFaq.delete(faq.id);
    await load();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">FAQ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Questions shown on the home page and the Help page.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => openEditor(null)}>
          Add question
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {faqs.map((faq) => (
          <div
            key={faq.id}
            className="flex flex-wrap items-center gap-4 rounded-2xl border border-border p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{faq.question}</p>
              <p className="truncate text-xs text-muted-foreground">{faq.answer}</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                faq.active ? 'bg-[hsl(var(--trust))] text-white' : 'bg-muted text-muted-foreground'
              }`}
            >
              {faq.active ? 'live' : 'hidden'}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => toggleActive(faq)}>
                {faq.active ? 'Hide' : 'Show'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEditor(faq)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(faq)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
        {!faqs.length && <p className="text-sm text-muted-foreground">No questions yet.</p>}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit question' : 'New question'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="Question">
              <Input value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} />
            </FormField>
            <FormField label="Answer">
              <Textarea rows={4} value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} />
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
            <Button onClick={save} disabled={busy || !form.question.trim()}>
              {busy ? 'Saving…' : 'Save question'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
