import db from '@/api/client';

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';

import FaqSection from '@/components/home/FaqSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';

export default function Help() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const findBooking = async (event) => {
    event.preventDefault();
    setError('');
    const clean = reference.trim().toUpperCase();
    if (!clean) {
      setError('Enter the booking reference from your ticket.');
      return;
    }
    if (!isAuthenticated) {
      setError('Please sign in with the email you booked with so we can open your ticket.');
      return;
    }
    setBusy(true);
    const page = await db.entities.Booking.filter(
      { created_by_id: user.id, booking_ref: clean },
      { limit: 1 }
    );
    setBusy(false);
    const booking = page.items?.[0];
    if (booking) {
      navigate(`/booking/${booking.booking_ref}`);
    } else {
      setError('We could not find that reference in your account. Check the letters and try again.');
    }
  };

  return (
    <>
      <div className="border-b border-border bg-secondary/50 py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Help &amp; support</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            We are here 24/7, before and after your journey. Find your booking below, or read the answers travellers
            ask us most.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-12">
        <Card className="rounded-2xl border-border p-6 shadow-sm">
          <h2 className="font-display text-xl font-bold">Find my booking</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the reference from your e-ticket (it starts with BL).
          </p>
          <form onSubmit={findBooking} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="reference" className="text-xs font-semibold text-muted-foreground">
                Booking reference
              </Label>
              <Input
                id="reference"
                className="mt-1 font-mono uppercase tracking-widest"
                placeholder="BL4K9M2P"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
            <Button type="submit" className="rounded-xl" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Open my ticket
            </Button>
          </form>
          {error && (
            <Alert className="mt-4 rounded-xl">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!isAuthenticated && (
            <p className="mt-4 text-sm text-muted-foreground">
              <Link to="/login" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>{' '}
              with the email you booked with — all your tickets then live in My trips.
            </p>
          )}
        </Card>
      </div>

      <FaqSection />
    </>
  );
}