import db from '@/api/client';

import React, { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, Loader2, Lock, Smartphone } from 'lucide-react';

import TripSummary from '@/components/TripSummary';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { makeBookingRef, makeTxRef, saveTicket } from '@/lib/bookingRef';
import { Input } from '@/components/ui/input';
import { commissionPercentFor, commissionSplit, discountFor } from '@/lib/commission';
import { isPaymentConfigured, payWithFlutterwave } from '@/lib/flutterwave';
import { formatMoney, todayISO } from '@/lib/format';
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

  const payConfigured = isPaymentConfigured();
  const discount = coupon ? discountFor(coupon, draft.amount) : 0;
  const paid = Math.max(draft.amount - discount, 0);

  const handleSuccess = async (bookingRef, txRef, response) => {
    finished.current = true;
    try {
      const [operatorPage, settingPage] = await Promise.all([
        db.entities.Operator.filter({ slug: draft.operator_slug }, { limit: 1 }),
        db.entities.PlatformSetting.list({ limit: 1 }),
      ]);
      const operator = operatorPage.items?.[0] || null;
      const percent = commissionPercentFor(operator, settingPage.items?.[0] || null, draft.crossing_border);
      const split = commissionSplit(paid, percent);

      const booking = await db.entities.Booking.create({
        booking_ref: bookingRef,
        status: 'paid',
        trip_key: draft.trip_key,
        route_slug: draft.route_slug,
        travel_date: draft.travel_date,
        origin_city: draft.origin_city,
        destination_city: draft.destination_city,
        operator_name: draft.operator_name,
        operator_slug: draft.operator_slug,
        departure_time: draft.departure_time,
        duration_minutes: draft.duration_minutes,
        bus_class: draft.bus_class,
        seats: draft.seats,
        passengers: draft.passengers,
        passenger_count: draft.passenger_count,
        contact_name: draft.contact_name,
        contact_email: draft.contact_email,
        contact_phone: draft.contact_phone,
        amount: paid,
        currency: draft.currency,
        payment_provider: 'flutterwave',
        payment_ref: txRef,
        payment_tx_id: response?.transaction_id ? String(response.transaction_id) : '',
        coupon_code: coupon?.code || '',
        discount_amount: discount,
        commission_percent: percent,
        platform_fee: split.fee,
        operator_net: split.net,
        operator_owner_email: operator?.owner_email || '',
        paid_at: new Date().toISOString(),
      });

      await db.entities.DepartureSeat.create({
        trip_key: draft.trip_key,
        travel_date: draft.travel_date,
        route_slug: draft.route_slug,
        operator_slug: draft.operator_slug,
        operator_name: draft.operator_name,
        departure_time: draft.departure_time,
        seats: draft.seats,
        seat_count: draft.seats.length,
      });

      saveTicket(booking);
      navigate(`/booking/${booking.booking_ref}`);
    } catch (caught) {
      setBusy(false);
      setError(
        `Your payment went through but we could not issue the ticket automatically. Quote reference ${bookingRef} to our support team and we will send it right away.`
      );
    }
  };

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCheckingCoupon(true);
    setCoupon(null);
    setCouponNote('');

    const page = await db.entities.Coupon.filter({ code }, { limit: 1 });
    const found = page.items?.[0] || null;

    if (!found || !found.active) {
      setCouponNote('We cannot apply that code.');
    } else if (found.expires_at && found.expires_at < todayISO()) {
      setCouponNote('That code has expired.');
    } else if (found.min_amount && draft.amount < found.min_amount) {
      setCouponNote(`That code needs a booking of at least ${formatMoney(found.min_amount, draft.currency)}.`);
    } else {
      setCoupon(found);
      setCouponNote(`${found.code} applied — you save ${formatMoney(discountFor(found, draft.amount), draft.currency)}.`);
    }
    setCheckingCoupon(false);
  };

  const pay = () => {
    setError('');
    setNotice('');
    const bookingRef = makeBookingRef();
    const txRef = makeTxRef();
    const started = payWithFlutterwave({
      txRef,
      amount: paid,
      currency: draft.currency,
      customer: {
        email: draft.contact_email,
        phone_number: draft.contact_phone,
        name: draft.contact_name,
      },
      description: `${draft.origin_city} to ${draft.destination_city} · ${draft.travel_date} · ${draft.seats.join(', ')}`,
      onSuccess: (response) => handleSuccess(bookingRef, txRef, response),
      onClose: () => {
        if (!finished.current) {
          setBusy(false);
          setNotice('The payment window closed before we could confirm your payment. Your seats are still free — you can try again.');
        }
      },
    });

    if (!started) {
      setNotice('We could not open the secure payment window. Please check your connection and try again.');
      return;
    }
    finished.current = false;
    setBusy(true);
  };

  const labels = buildTrip(
    {
      route_slug: draft.route_slug,
      operator_slug: draft.operator_slug,
      departure_time: draft.departure_time,
      duration_minutes: draft.duration_minutes,
      origin_city: draft.origin_city,
      destination_city: draft.destination_city,
    },
    draft.travel_date
  );

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
            <div className="mt-4 space-y-3">
              {draft.passengers.map((passenger) => (
                <div key={passenger.seat} className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-0 last:pb-0">
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
          </Card>

          <Card className="rounded-2xl border-border p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">Ticket sent to</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {draft.contact_name} · {draft.contact_email} · {draft.contact_phone}
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
              Payments are processed securely by Flutterwave. BusLink never stores your card details.
            </p>
          </Card>
        </div>

        <aside>
          <div className="sticky top-24 space-y-4">
            <TripSummary
              operatorName={draft.operator_name}
              originCity={draft.origin_city}
              destinationCity={draft.destination_city}
              travelDate={draft.travel_date}
              departureLabel={labels.departureLabel}
              arrivalLabel={labels.arrivalLabel}
              nextDay={labels.nextDay}
              durationMinutes={draft.duration_minutes}
              busClass={draft.bus_class}
              seats={draft.seats}
              passengerCount={draft.passenger_count}
            />

            <Card className="rounded-2xl border-border p-5 shadow-sm">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {formatMoney(draft.price, draft.currency)} × {draft.passenger_count}
                </span>
                <span>{formatMoney(draft.amount, draft.currency)}</span>
              </div>

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
                  <span>-{formatMoney(discount, draft.currency)}</span>
                </div>
              )}

              <Separator className="my-3" />
              <div className="flex items-end justify-between">
                <span className="font-medium">Total</span>
                <span className="font-display text-2xl font-extrabold">{formatMoney(paid, draft.currency)}</span>
              </div>

              {!payConfigured && (
                <Alert className="mt-4 rounded-xl">
                  <AlertDescription>
                    Online payment is not switched on yet. Add your Flutterwave public key to start accepting card and
                    mobile money payments.
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
                  <>Pay {formatMoney(paid, draft.currency)}</>
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