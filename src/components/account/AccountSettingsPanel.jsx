import db from '@/api/client';

import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Lock, LogOut, Trash2, Upload, User } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

const LOGO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

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

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const logoInputRef = useRef(null);

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

  const applyLogo = (logoPath) => {
    setProfile((prev) => (prev ? { ...prev, logo_path: logoPath } : prev));
    setUser((prev) => (prev ? { ...prev, logo_path: logoPath } : prev));
  };

  const handleLogoPick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setLogoError('');
    if (!LOGO_CONTENT_TYPES.includes(file.type)) {
      setLogoError('Use a JPEG, PNG, WebP, or SVG image.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Image must be 2 MB or smaller.');
      return;
    }
    setLogoUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('We could not read that file. Please try again.'));
        reader.readAsDataURL(file);
      });
      const dataBase64 = String(dataUrl).split(',')[1] || '';
      const updated = await db.profile.uploadLogo({ contentType: file.type, dataBase64 });
      applyLogo(updated.logo_path);
    } catch (err) {
      setLogoError(err.message || 'We could not upload your photo. Please try again.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    setLogoError('');
    setLogoUploading(true);
    try {
      await db.profile.removeLogo();
      applyLogo(null);
    } catch (err) {
      setLogoError(err.message || 'We could not remove your photo. Please try again.');
    } finally {
      setLogoUploading(false);
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
  const photoHelperCopy =
    profile?.role === 'operator'
      ? 'Shown on your operator dashboard header. JPEG, PNG, WebP or SVG, up to 2 MB.'
      : 'Shown on your account. JPEG, PNG, WebP or SVG, up to 2 MB.';

  return (
    <div className={`space-y-6 ${className}`}>
      <Card className="rounded-3xl border-border p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            {profile?.logo_path ? <AvatarImage src={profile?.logo_path} alt="" /> : null}
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
          <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-lg font-extrabold tracking-tight">Profile photo</h2>
        </div>
        <div className="mt-4 flex items-start gap-4">
          <Avatar className="h-16 w-16 shrink-0 rounded-xl">
            {profile?.logo_path ? (
              <AvatarImage src={profile?.logo_path} alt="" className="rounded-xl object-cover" />
            ) : null}
            <AvatarFallback className="rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              {initialsFor(profile)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{photoHelperCopy}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoPick}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 font-medium"
                disabled={logoUploading}
                onClick={() => logoInputRef.current?.click()}
              >
                {logoUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {profile?.logo_path ? 'Replace' : 'Upload'}
              </Button>
              {profile?.logo_path && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 font-medium text-destructive hover:bg-destructive/10"
                  disabled={logoUploading}
                  onClick={handleLogoRemove}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
        {logoError && (
          <div className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{logoError}</div>
        )}
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
