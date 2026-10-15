import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, Loader2, Lock, Smartphone } from 'lucide-react';

import TripSummary from '@/components/TripSummary';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { makeBookingRef, saveTicket } from '@/lib/bookingRef';
import { Input } from '@/components/ui/input';
import { discountFor } from '@/lib/commission';
import { looksConfigured, payWithFlutterwave } from '@/lib/flutterwave';
import { formatMoney } from '@/lib/format';
import { buildTrip } from '@/lib/trips';

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const draft = location.state?.draft;
  const finished = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponNote, setCouponNote] = useState('');
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [payKey, setPayKey] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/config', { credentials: 'include' })
      .then((response) => response.json())
      .then((config) => {
        if (active) setPayKey(config.flutterwavePublicKey || '');
      })
      .catch(() => {
        if (active) setPayKey('');
      });
    return () => {
      active = false;
    };
  }, []);

  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold">Your seat selection expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          For your security we do not keep an unfinished booking. Please pick your seats again.
        </p>
        <Button asChild className="mt-6 rounded-xl">
          <Link to="/">Back to search</Link>
        </Button>
      </div>
    );
  }

  const legs = Array.isArray(draft.legs) && draft.legs.length ? draft.legs : [draft];
  const isReturn = legs.length > 1;
  const totalAmount = legs.reduce((sum, leg) => sum + Number(leg.amount || 0), 0);
  const payConfigured = looksConfigured(payKey);
  const discount = coupon ? discountFor(coupon, totalAmount) : 0;
  const paid = Math.max(totalAmount - discount, 0);

  const handleSuccess = async (bookingRef, response) => {
    finished.current = true;
    try {
      const booking = await fetch('/api/payments/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_ref: bookingRef,
          transaction_id: response?.transaction_id ? String(response.transaction_id) : '',
          legs: legs.map((leg) => ({
            trip_key: leg.trip_key,
            seats: leg.seats,
            passengers: leg.passengers,
            passenger_count: leg.passenger_count,
          })),
          group_ref: draft.group_ref || '',
          contact_name: legs[legs.length - 1].contact_name,
          contact_email: legs[legs.length - 1].contact_email,
          contact_phone: legs[legs.length - 1].contact_phone,
          coupon_code: coupon?.code || '',
        }),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const error = new Error(body.error || 'We could not confirm your payment.');
          error.status = res.status;
          throw error;
        }
        return body;
      });

      saveTicket(booking);
      navigate(`/booking/${booking.booking_ref}`);
    } catch (caught) {
      setBusy(false);
      setError(
        `${caught?.message || 'We could not confirm your payment.'} Your payment provider has the transaction — quote reference ${bookingRef} to our support team if you were charged.`,
      );
    }
  };

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCheckingCoupon(true);
    setCoupon(null);
    setCouponNote('');

    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, amount: totalAmount, currency: legs[0].currency }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCouponNote(body.error || 'We cannot apply that code.');
      } else {
        setCoupon(body);
        setCouponNote(`${body.code} applied — you save ${formatMoney(discountFor(body, totalAmount), legs[0].currency)}.`);
      }
    } catch {
      setCouponNote('We cannot apply that code.');
    }
    setCheckingCoupon(false);
  };

  const pay = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    for (const leg of legs) {
      try {
        const hold = await fetch('/api/seats/hold', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trip_key: leg.trip_key, seats: leg.seats }),
        });
        const holdBody = await hold.json().catch(() => ({}));
        if (!hold.ok) {
          setError(holdBody.error || 'We could not hold your seats. Please pick your seats again.');
          setBusy(false);
          return;
        }
      } catch {
        setError('We could not hold your seats. Please check your connection and try again.');
        setBusy(false);
        return;
      }
    }

    const bookingRef = makeBookingRef();
    const description = legs
      .map((leg) => `${leg.origin_city} to ${leg.destination_city} · ${leg.travel_date} · ${leg.seats.join(', ')}`)
      .join(' + ');
    const started = payWithFlutterwave({
      publicKey: payKey,
      txRef: bookingRef,
      amount: paid,
      currency: legs[0].currency,
      customer: {
        email: legs[legs.length - 1].contact_email,
        phone_number: legs[legs.length - 1].contact_phone,
        name: legs[legs.length - 1].contact_name,
      },
      description,
      onSuccess: (response) => handleSuccess(bookingRef, response),
      onClose: () => {
        if (!finished.current) {
          setBusy(false);
          setNotice('The payment window closed before we could confirm your payment. Your seats are still free — you can try again.');
        }
      },
    });

    if (!started) {
      setNotice('We could not open the secure payment window. Please check your connection and try again.');
      setBusy(false);
      return;
    }
    finished.current = false;
  };

  const legLabels = legs.map((leg, index) => ({
    leg,
    label: isReturn ? (index === 0 ? 'Outbound' : 'Return') : null,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Confirm and pay</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your seats are held while you complete the payment.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="rounded-2xl border-border p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">Travellers</h2>
            <div className="mt-4 space-y-4">
              {legLabels.map(({ leg, label }) => (
                <div key={leg.trip_key} className="space-y-3">
                  {label && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {label} · {leg.origin_city} → {leg.destination_city} · {leg.travel_date}
                    </p>
                  )}
                  {leg.passengers.map((passenger) => (
                    <div key={`${leg.trip_key}-${passenger.seat}`} className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold">{passenger.name}</p>
                        <p className="text-xs text-muted-foreground">{passenger.phone || 'No mobile number added'}</p>
                      </div>
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">
                        Seat {passenger.seat}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-2xl border-border p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">Ticket sent to</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {legs[legs.length - 1].contact_name} · {legs[legs.length - 1].contact_email} · {legs[legs.length - 1].contact_phone}
            </p>
          </Card>

          <Card className="rounded-2xl border-border p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">How would you like to pay?</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Debit or credit card</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                <Smartphone className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">MTN &amp; Airtel Mobile Money</span>
              </div>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Payments are processed securely by Flutterwave. YooTerminal never stores your card details.
            </p>
          </Card>
        </div>

        <aside>
          <div className="sticky top-24 space-y-4">
            {legLabels.map(({ leg, label }) => {
              const labels = buildTrip(
                {
                  route_slug: leg.route_slug,
                  operator_slug: leg.operator_slug,
                  departure_time: leg.departure_time,
                  duration_minutes: leg.duration_minutes,
                  origin_city: leg.origin_city,
                  destination_city: leg.destination_city,
                },
                leg.travel_date
              );
              return (
                <div key={leg.trip_key} className="space-y-4">
                  {label && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  )}
                  <TripSummary
                    operatorName={leg.operator_name}
                    originCity={leg.origin_city}
                    destinationCity={leg.destination_city}
                    travelDate={leg.travel_date}
                    departureLabel={labels.departureLabel}
                    arrivalLabel={labels.arrivalLabel}
                    nextDay={labels.nextDay}
                    durationMinutes={leg.duration_minutes}
                    busClass={leg.bus_class}
                    seats={leg.seats}
                    passengerCount={leg.passenger_count}
                  />
                </div>
              );
            })}

            <Card className="rounded-2xl border-border p-5 shadow-sm">
              {legLabels.map(({ leg, label }) => (
                <div
                  key={leg.trip_key}
                  className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
                >
                  <span>
                    {label ? `${label} · ` : ''}
                    {formatMoney(leg.price, leg.currency)} × {leg.passenger_count}
                  </span>
                  <span>{formatMoney(leg.amount, leg.currency)}</span>
                </div>
              ))}

              <div className="mt-4 flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  placeholder="Promo code"
                  className="h-9 uppercase"
                />
                <Button type="button" variant="outline" className="h-9" onClick={applyCoupon} disabled={checkingCoupon}>
                  {checkingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
              {couponNote && <p className="mt-2 text-xs text-muted-foreground">{couponNote}</p>}

              {discount > 0 && (
                <div className="mt-3 flex items-center justify-between text-sm font-semibold text-[hsl(var(--trust))]">
                  <span>Discount · {coupon.code}</span>
                  <span>-{formatMoney(discount, legs[0].currency)}</span>
                </div>
              )}

              <Separator className="my-3" />
              <div className="flex items-end justify-between">
                <span className="font-medium">Total</span>
                <span className="font-display text-2xl font-extrabold">{formatMoney(paid, legs[0].currency)}</span>
              </div>

              {!payConfigured && (
                <Alert className="mt-4 rounded-xl">
                  <AlertDescription>
                    Online payment is not switched on yet. The Flutterwave keys need to be set on the server to
                    accept card and mobile money payments.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
                onClick={pay}
                disabled={busy || !payConfigured}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Waiting for payment…
                  </>
                ) : (
                  <>Pay {formatMoney(paid, legs[0].currency)}</>
                )}
              </Button>

              {notice && (
                <Alert className="mt-3 rounded-xl">
                  <AlertDescription>{notice}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" className="mt-3 rounded-xl">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}