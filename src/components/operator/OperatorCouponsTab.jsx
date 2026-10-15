import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';

import FormField from '@/components/manage/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/format';

const EMPTY = {
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value: '',
  min_amount: '',
  currency: '',
  expires_at: '',
  max_redemptions: '',
};

function discountLabel(coupon) {
  if (coupon.discount_type === 'fixed') {
    return formatMoney(Number(coupon.discount_value) || 0, coupon.currency || 'UGX');
  }
  return `${Number(coupon.discount_value) || 0}% off`;
}

export default function OperatorCouponsTab({ operator }) {
  const [coupons, setCoupons] = useState([]);
  const [usage, setUsage] = useState({});
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const page = await db.entities.Coupon.filter({}, { sort: '-created_date', limit: 200 });
    const items = page.items || [];
    setCoupons(items);
    if (!items.length) {
      setUsage({});
      return;
    }
    const codes = items.map((coupon) => coupon.code).filter(Boolean);
    const result = await db.entities.Booking.aggregate({
      query: { operator_slug: operator.slug, status: 'paid', coupon_code: { $in: codes } },
      groupBy: 'coupon_code',
      sum: ['discount_amount'],
    });
    const map = {};
    for (const row of result.rows || []) {
      map[row.coupon_code] = { used: Number(row.count) || 0, given: Number(row.sum_discount_amount) || 0 };
    }
    setUsage(map);
  }, [operator.slug]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (coupon) => {
    setEditing(coupon || {});
    setForm(
      coupon
        ? {
            code: coupon.code || '',
            description: coupon.description || '',
            discount_type: coupon.discount_type || 'percent',
            discount_value: coupon.discount_value != null ? String(coupon.discount_value) : '',
            min_amount: coupon.min_amount != null ? String(coupon.min_amount) : '',
            currency: coupon.currency || '',
            expires_at: coupon.expires_at || '',
            max_redemptions: coupon.max_redemptions != null ? String(coupon.max_redemptions) : '',
          }
        : EMPTY
    );
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      operator_slug: operator.slug,
      operator_owner_email: operator.owner_email || '',
      code: form.code.trim().toUpperCase(),
      description: form.description.trim(),
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value) || 0,
      min_amount: form.min_amount === '' ? null : Number(form.min_amount) || 0,
      currency: form.currency.trim().toUpperCase() || null,
      expires_at: form.expires_at || null,
      max_redemptions: form.max_redemptions === '' ? null : Number(form.max_redemptions) || null,
      active: editing?.id ? Boolean(editing.active) : true,
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
    if (!window.confirm(`Delete code ${coupon.code}?`)) return;
    await db.entities.Coupon.delete(coupon.id);
    await load();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Discount codes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Codes your customers can enter at checkout. They only work on your departures.
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => openEditor(null)} disabled={!operator.owner_email}>
          New code
        </Button>
      </div>

      {!operator.owner_email && (
        <p className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          This operator has no owner email on file, so codes cannot be created here yet.
        </p>
      )}

      <div className="mt-5 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Minimum</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => {
              const stat = usage[coupon.code] || { used: 0, given: 0 };
              return (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <p className="font-mono text-sm font-bold tracking-wide">{coupon.code}</p>
                    {coupon.description && (
                      <p className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground">{coupon.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{discountLabel(coupon)}</TableCell>
                  <TableCell className="text-sm">
                    {coupon.min_amount ? formatMoney(coupon.min_amount, coupon.currency || 'UGX') : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {stat.used}
                    {coupon.max_redemptions ? ` / ${coupon.max_redemptions}` : ''}
                    {stat.given > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {formatMoney(stat.given, coupon.currency || 'UGX')} given
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{coupon.expires_at || 'Never'}</TableCell>
                  <TableCell>
                    <Badge variant={coupon.active ? 'default' : 'secondary'}>
                      {coupon.active ? 'Active' : 'Paused'}
                    </Badge>
                  </TableCell>
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
              );
            })}
            {!coupons.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No discount codes yet. Create one to run a promo for your routes.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit code' : 'New discount code'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Code" hint="Customers type this at checkout.">
              <Input
                value={form.code}
                disabled={Boolean(editing?.id)}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                placeholder="SAVE10"
              />
            </FormField>
            <FormField label="Description">
              <Input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="October promo"
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
            <FormField label={form.discount_type === 'fixed' ? 'Amount off' : 'Percentage off'}>
              <Input
                type="number"
                value={form.discount_value}
                onChange={(event) => setForm({ ...form, discount_value: event.target.value })}
                placeholder={form.discount_type === 'fixed' ? '5000' : '10'}
              />
            </FormField>
            {form.discount_type === 'fixed' && (
              <FormField label="Currency" hint="Currency for the fixed discount.">
                <Input
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}
                  placeholder="UGX"
                />
              </FormField>
            )}
            <FormField label="Minimum booking" hint="Leave blank for no minimum.">
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
            <FormField label="Usage limit" hint="Maximum number of bookings. Leave blank for unlimited.">
              <Input
                type="number"
                value={form.max_redemptions}
                onChange={(event) => setForm({ ...form, max_redemptions: event.target.value })}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={busy || !form.code.trim() || !(Number(form.discount_value) > 0)}
            >
              {busy ? 'Saving…' : 'Save code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
