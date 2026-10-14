import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/format';

const STATUS_BADGES = {
  refunded: 'bg-[hsl(var(--trust))] text-white',
  refund_pending: 'bg-secondary text-primary',
  not_refunded: 'bg-muted text-muted-foreground',
};

const formatDate = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatNextAttempt = (epochMs) => {
  if (!epochMs) return '—';
  const date = new Date(Number(epochMs));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function AdminRefundsTab() {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/refunds', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not load refunds');
      setRefunds(data?.refunds || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load refunds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = async (refund) => {
    setBusyId(refund.id);
    setNote('');
    try {
      const res = await fetch(`/api/admin/refunds/${encodeURIComponent(refund.id)}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not retry the refund');
      setNote(
        data.refund_status === 'refunded'
          ? `${data.booking_ref} refunded successfully.`
          : `${data.booking_ref} is still pending — the next automatic attempt is scheduled.`,
      );
      await load();
    } catch (err) {
      setError(err.message || 'Could not retry the refund');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Refund queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every refund the platform owes. Failed attempts retry automatically with a growing backoff — use retry to
            try one immediately.
          </p>
        </div>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {note && (
        <p className="mt-4 rounded-xl border border-[hsl(var(--trust))]/40 bg-[hsl(var(--trust))]/10 px-3 py-2 text-sm">
          {note}
        </p>
      )}

      <div className="mt-5 overflow-x-auto">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking</TableHead>
                <TableHead>Trip</TableHead>
                <TableHead>Traveller</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Refund status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Next retry</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.map((refund) => (
                <TableRow key={refund.id}>
                  <TableCell>
                    <p className="font-semibold">{refund.booking_ref}</p>
                    <p className="text-xs text-muted-foreground">cancelled {formatDate(refund.cancelled_at)}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {refund.origin_city} → {refund.destination_city}
                    <p className="text-xs">{refund.operator_name} · {formatDate(refund.travel_date)}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {refund.contact_name || '—'}
                    <p className="text-xs">{refund.contact_email}</p>
                  </TableCell>
                  <TableCell className="text-sm font-semibold">
                    {formatMoney(refund.amount, refund.currency)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        STATUS_BADGES[refund.refund_status] || STATUS_BADGES.not_refunded
                      }`}
                    >
                      {refund.refund_status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{refund.refund_attempts}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatNextAttempt(refund.refund_next_attempt_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {refund.refund_status === 'refund_pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => retry(refund)}
                        disabled={busyId === refund.id}
                      >
                        {busyId === refund.id ? 'Retrying…' : 'Retry now'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!refunds.length && (
                <TableRow>
                  <TableCell colSpan={8} className="text-sm text-muted-foreground">
                    No refunds recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}
