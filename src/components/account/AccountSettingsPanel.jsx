import db from '@/api/client';

import React, { useEffect, useState } from 'react';
import { Loader2, Lock, LogOut, User } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const ROLE_LABELS = {
  admin: 'Admin',
  operator: 'Operator',
  user: 'Customer',
};

const initialsFor = (profile) => {
  const source = profile?.full_name || profile?.email || '';
  const parts = source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part.charAt(0)).join('').toUpperCase() || '?';
};

export default function AccountSettingsPanel({ className = '' }) {
  const { user, setUser, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSaved, setNameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    let active = true;
    db.profile
      .get()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setFullName(data?.full_name || '');
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setProfile(user);
        setFullName(user?.full_name || '');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    setNameError('');
    setNameSaved(false);
    const trimmed = fullName.trim();
    if (!trimmed) {
      setNameError('Enter a display name.');
      return;
    }
    setNameSaving(true);
    try {
      const updated = await db.profile.update({ fullName: trimmed });
      setProfile(updated);
      setFullName(updated.full_name || trimmed);
      setUser((prev) => (prev ? { ...prev, full_name: updated.full_name || trimmed } : prev));
      setNameSaved(true);
    } catch (err) {
      setNameError(err.message || 'We could not update your profile. Please try again.');
    } finally {
      setNameSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    setPasswordSaving(true);
    try {
      await db.profile.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err.message || 'We could not change your password. Please try again.');
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-72 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[profile?.role] || 'User';

  return (
    <div className={`space-y-6 ${className}`}>
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="bg-primary text-sm font-bold text-primary-foreground">
              {initialsFor(profile)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-extrabold tracking-tight">
              {profile?.full_name || 'Your account'}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{profile?.email}</p>
          </div>
          <Badge variant="secondary" className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
            {roleLabel}
          </Badge>
        </div>

        <form onSubmit={handleNameSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="display-name"
                type="text"
                autoComplete="name"
                maxLength={100}
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          {nameError && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{nameError}</div>
          )}
          {nameSaved && (
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">Profile updated.</div>
          )}
          <Button type="submit" className="h-11 font-medium" disabled={nameSaving}>
            {nameSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </form>
      </Card>

      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-lg font-extrabold tracking-tight">Change password</h2>
        </div>
        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-12"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-12"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-12"
              required
            />
          </div>
          {passwordError && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{passwordError}</div>
          )}
          {passwordSaved && (
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">Password updated.</div>
          )}
          <Button type="submit" className="h-11 font-medium" disabled={passwordSaving}>
            {passwordSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Update password'
            )}
          </Button>
        </form>
      </Card>

      <Card className="rounded-3xl border-destructive/40 border p-6 shadow-sm">
        <h2 className="font-display text-lg font-extrabold tracking-tight text-destructive">Sign out</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          End your session on this device. You can sign back in anytime with your email and password.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 h-11 font-medium text-destructive hover:bg-destructive/10"
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </Card>
    </div>
  );
}
