import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ROLE_BADGES = {
  admin: 'bg-primary text-primary-foreground',
  operator: 'bg-[hsl(var(--trust))] text-white',
  user: 'bg-secondary text-primary',
};

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'operator', label: 'Operator' },
  { value: 'admin', label: 'Admin' },
];

const formatDate = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function AdminUsersTab({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not load users');
      setUsers(data?.users || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyRole = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(pending.user.id)}/role`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: pending.role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not update the role');
      setPending(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not update the role');
    } finally {
      setBusy(false);
    }
  };

  const requestRole = (user, role) => {
    if (role === user.role) return;
    setPending({ user, role });
  };

  const operatorLabel = (user) => {
    if (!user.operators?.length) return '—';
    return user.operators.map((operator) => operator.name).join(', ');
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Registered users</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Promote a passenger to operator to open a bus-company dashboard, or to admin to run the platform. Operators
            link to a company through the dashboard owner email on the Operators tab.
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
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Owning operator</TableHead>
                <TableHead className="text-right">Change role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-semibold">{user.name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          ROLE_BADGES[user.role] || ROLE_BADGES.user
                        }`}
                      >
                        {user.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(user.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{operatorLabel(user)}</TableCell>
                    <TableCell className="text-right">
                      <Select value={user.role} onValueChange={(role) => requestRole(user, role)}>
                        <SelectTrigger
                          className="ml-auto w-[130px] rounded-lg"
                          disabled={isSelf || busy}
                          aria-label={`Role for ${user.email}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!users.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No users yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role for {pending?.user?.email}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pending?.user?.name || pending?.user?.email} will move from{' '}
            <span className="font-semibold text-foreground">{pending?.user?.role}</span> to{' '}
            <span className="font-semibold text-foreground">{pending?.role}</span>. Operators can manage their linked
            bus company; admins can manage the whole platform.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={applyRole} disabled={busy}>
              {busy ? 'Saving…' : 'Change role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
