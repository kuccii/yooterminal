import db from '@/api/client';

import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FormField from '@/components/manage/FormField';
import { commissionPercentFor } from '@/lib/commission';

const STATUS_STYLES = {
  approved: 'bg-[hsl(var(--trust))] text-white',
  pending: 'bg-secondary text-primary',
  suspended: 'bg-destructive text-destructive-foreground',
};

const COUNTRIES = ['Uganda', 'Rwanda'];
const DEFAULT_COLOR = '#0f766e';

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export default function AdminOperatorsTab({ operators, setting, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ status: 'pending', commission_percent: '', owner_email: '', featured: false });
  const [busy, setBusy] = useState(false);

  const openEditor = (operator) => {
    setCreating(false);
    setEditing(operator);
    setForm({
      status: operator.status || 'pending',
      commission_percent: operator.commission_percent ? String(operator.commission_percent) : '',
      owner_email: operator.owner_email || '',
      featured: Boolean(operator.featured),
    });
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      country: 'Uganda',
      brand_color: DEFAULT_COLOR,
      status: 'pending',
      commission_percent: '',
      owner_email: '',
      featured: false,
    });
    setCreating(true);
  };

  const syncDepartures = async (slug, payload) => {
    await db.entities.Schedule.updateMany(
      { operator_slug: slug },
      { $set: { owner_email: payload.owner_email, operator_status: payload.status } }
    );
    await db.entities.Bus.updateMany({ operator_slug: slug }, { $set: { owner_email: payload.owner_email } });
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      status: form.status,
      commission_percent: Number(form.commission_percent) || 0,
      owner_email: form.owner_email.trim(),
      featured: form.featured,
    };
    await db.entities.Operator.update(editing.id, payload);
    await syncDepartures(editing.slug, payload);
    setBusy(false);
    setEditing(null);
    await onChanged();
  };

  const uniqueSlug = (base) => {
    const taken = new Set(operators.map((operator) => operator.slug));
    let slug = base || 'operator';
    let suffix = 2;
    while (taken.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  };

  const create = async () => {
    const name = (form.name || '').trim();
    if (!name) return;
    setBusy(true);
    await db.entities.Operator.create({
      name,
      slug: uniqueSlug(slugify(name)),
      country: form.country,
      brand_color: form.brand_color || DEFAULT_COLOR,
      status: form.status,
      commission_percent: Number(form.commission_percent) || 0,
      owner_email: (form.owner_email || '').trim(),
      featured: form.featured,
    });
    setBusy(false);
    setCreating(false);
    await onChanged();
  };

  const changeStatus = async (operator, status) => {
    await db.entities.Operator.update(operator.id, { status });
    await db.entities.Schedule.updateMany({ operator_slug: operator.slug }, { $set: { operator_status: status } });
    await onChanged();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Operators on the network</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve a company to put their departures on sale. Suspending hides every departure immediately.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Platform default commission: {commissionPercentFor(null, setting, false)}% · cross-border{' '}
            {commissionPercentFor(null, setting, true)}%
          </p>
          <Button size="sm" className="rounded-lg" onClick={openCreate}>
            Add operator
          </Button>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operator</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Dashboard owner</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operators.map((operator) => (
              <TableRow key={operator.id}>
                <TableCell>
                  <p className="font-semibold">{operator.name}</p>
                  <p className="text-xs text-muted-foreground">{operator.country}</p>
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      STATUS_STYLES[operator.status || 'pending']
                    }`}
                  >
                    {operator.status || 'pending'}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {operator.commission_percent ? `${operator.commission_percent}%` : 'Platform default'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {operator.owner_email || 'Unassigned'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    {operator.status !== 'approved' && (
                      <Button size="sm" className="rounded-lg" onClick={() => changeStatus(operator, 'approved')}>
                        Approve
                      </Button>
                    )}
                    {operator.status === 'approved' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => changeStatus(operator, 'suspended')}
                      >
                        Suspend
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => openEditor(operator)}>
                      Manage
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!operators.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  No operators yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(editing) || creating}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating ? 'Add operator' : editing?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {creating && (
              <>
                <FormField label="Company name" hint="Shown to passengers across the site.">
                  <Input
                    value={form.name || ''}
                    placeholder="e.g. Coastal Explorer"
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </FormField>

                <FormField label="Country">
                  <Select value={form.country} onValueChange={(value) => setForm({ ...form, country: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Brand color" hint="Used for the company avatar and badges.">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.brand_color || DEFAULT_COLOR}
                      onChange={(event) => setForm({ ...form, brand_color: event.target.value })}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-card p-1"
                      aria-label="Brand color"
                    />
                    <span className="text-sm text-muted-foreground">{form.brand_color || DEFAULT_COLOR}</span>
                  </div>
                </FormField>
              </>
            )}

            <FormField label="Network status">
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="Commission per ticket (%)"
              hint="Leave empty to use the platform default. This is charged on every ticket sold."
            >
              <Input
                type="number"
                min="0"
                max="40"
                value={form.commission_percent}
                onChange={(event) => setForm({ ...form, commission_percent: event.target.value })}
              />
            </FormField>

            <FormField
              label="Dashboard owner email"
              hint={
                creating
                  ? 'That person signs up at /register with this email, then gets this company’s dashboard.'
                  : "The person who signs in with this email gets this operator's dashboard."
              }
            >
              <Input
                type="email"
                value={form.owner_email}
                onChange={(event) => setForm({ ...form, owner_email: event.target.value })}
              />
            </FormField>

            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-sm font-medium">Feature on the home page</span>
              <Switch
                checked={form.featured}
                onCheckedChange={(checked) => setForm({ ...form, featured: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
            >
              Cancel
            </Button>
            {creating ? (
              <Button onClick={create} disabled={busy || !(form.name || '').trim()}>
                {busy ? 'Adding…' : 'Add operator'}
              </Button>
            ) : (
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save operator'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}