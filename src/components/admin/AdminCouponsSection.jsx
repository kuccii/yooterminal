import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import FormField from '@/components/manage/FormField';
import { formatMoney } from '@/lib/format';

const EMPTY = {
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value: '',
  min_amount: '',
  currency: 'UGX',
  expires_at: '',
  active: true,
};

export default function AdminCouponsSection() {
  const [coupons, setCoupons] = useState([]);
  const [usage, setUsage] = useState({});
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [couponPage, usageResult] = await Promise.all([
      db.entities.Coupon.list({ sort: '-created_date', limit: 50 }),
      db.entities.Booking.aggregate({
        query: { coupon_code: { $ne: '' } },
        groupBy: 'coupon_code',
        sum: 'discount_amount',
      }),
    ]);
    setCoupons(couponPage.items || []);
    setUsage(
      Object.fromEntries((usageResult.rows || []).map((row) => [row.coupon_code, { used: row.count, given: row.sum_discount_amount }]))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (coupon) => {
    setEditing(coupon || {});
    setForm(coupon ? { ...EMPTY, ...coupon } : EMPTY);
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value) || 0,
      min_amount: Number(form.min_amount) || 0,
      currency: form.currency,
      expires_at: form.expires_at || '',
      active: form.active,
    };
    if (editing?.id) {
      await db.entities.Coupon.update(editing.id, payload);
    } else {
      await db.entities.Coupon.create(payload);
    }
    setBusy(false);
    setEditing(null);
    await load();
  };

  const toggleActive = async (coupon) => {
    await db.entities.Coupon.update(coupon.id, { active: !coupon.active });
    await load();
  };

  const remove = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    await db.entities.Coupon.delete(coupon.id);
    await load();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Coupons</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Travellers type the code at checkout. Percent codes scale with the fare; fixed codes subtract a set amount.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => openEditor(null)}>
          Add coupon
        </Button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Minimum</TableHead>
              <TableHead>Used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => (
              <TableRow key={coupon.id}>
                <TableCell>
                  <p className="font-semibold tracking-wide">{coupon.code}</p>
                  <p className="text-xs text-muted-foreground">
                    {coupon.description || '—'} {coupon.active ? '' : '· paused'}
                  </p>
                </TableCell>
                <TableCell className="text-sm">
                  {coupon.discount_type === 'fixed'
                    ? formatMoney(coupon.discount_value, coupon.currency)
                    : `${coupon.discount_value}%`}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {coupon.min_amount ? formatMoney(coupon.min_amount, coupon.currency) : 'None'}
                </TableCell>
                <TableCell className="text-sm">
                  {usage[coupon.code]?.used || 0} tickets
                  <span className="block text-xs text-muted-foreground">
                    {usage[coupon.code]?.given
                      ? `${formatMoney(usage[coupon.code].given, coupon.currency)} given away`
                      : 'no discount yet'}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{coupon.expires_at || 'No end date'}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(coupon)}>
                      {coupon.active ? 'Pause' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditor(coupon)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(coupon)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!coupons.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  No coupons yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit coupon' : 'New coupon'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Code">
                <Input
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                  className="uppercase"
                />
              </FormField>
              <FormField label="Discount type">
                <Select
                  value={form.discount_type}
                  onValueChange={(value) => setForm({ ...form, discount_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage off</SelectItem>
                    <SelectItem value="fixed">Fixed amount off</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label={form.discount_type === 'percent' ? 'Percent off' : 'Amount off'}>
                <Input
                  type="number"
                  value={form.discount_value}
                  onChange={(event) => setForm({ ...form, discount_value: event.target.value })}
                />
              </FormField>
              <FormField label="Currency" hint="Used for fixed amounts and the minimum spend.">
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
              <FormField label="Minimum spend">
                <Input
                  type="number"
                  value={form.min_amount}
                  onChange={(event) => setForm({ ...form, min_amount: event.target.value })}
                />
              </FormField>
              <FormField label="Expires">
                <Input
                  type="date"
                  value={form.expires_at}
                  onChange={(event) => setForm({ ...form, expires_at: event.target.value })}
                />
              </FormField>
            </div>

            <FormField label="Description">
              <Input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </FormField>

            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-sm font-medium">Accept this code at checkout</span>
              <Switch checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.code.trim()}>
              {busy ? 'Saving…' : 'Save coupon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}