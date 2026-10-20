import db from '@/api/client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, MapPin, Timer } from 'lucide-react';

import SeatMap from '@/components/SeatMap';
import TripSummary from '@/components/TripSummary';
import PassengerFields from '@/components/PassengerFields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/AuthContext';
import { buildTrip, parseTripKey } from '@/lib/trips';
import { formatMoney } from '@/lib/format';

export default function TripDetail() {
  const { tripKey = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const wanted = Number(params.get('passengers') || 1);

  const parsed = useMemo(() => parseTripKey(tripKey), [tripKey]);

  const [data, setData] = useState({ loading: true, schedule: null, route: null, cities: {}, taken: [] });
  const [selected, setSelected] = useState([]);
  const [passengers, setPassengers] = useState({});
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [hold, setHold] = useState(null);
  const [holdBusy, setHoldBusy] = useState(false);
  const [holdNote, setHoldNote] = useState('');
  const [outboundMissing, setOutboundMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const holdSeq = useRef(0);
  const holdRef = useRef(null);

  useEffect(() => {
    let active = true;
    setData((previous) => ({ ...previous, loading: true }));
    setSelected([]);
    setPassengers({});

    (async () => {
      const schedulePage = await db.entities.Schedule.filter(
        {
          route_slug: parsed.route_slug,
          operator_slug: parsed.operator_slug,
          departure_time: parsed.departure_time,
          active: true,
          operator_status: 'approved',
        },
        { limit: 1 }
      );
      const schedule = schedulePage.items?.[0] || null;
      if (!schedule) {
        if (active) setData({ loading: false, schedule: null, route: null, cities: {}, taken: [] });
        return;
      }

      const [routePage, takenPage] = await Promise.all([
        db.entities.Route.filter({ slug: parsed.route_slug }, { limit: 1 }),
        db.seats.taken(tripKey, parsed.travel_date),
      ]);
      const route = routePage.items?.[0] || null;

      let cities = {};
      if (route) {
        const cityPage = await db.entities.City.filter(
          { slug: { $in: [route.origin_slug, route.destination_slug] } },
          { limit: 4 }
        );
        cities = Object.fromEntries((cityPage.items || []).map((city) => [city.slug, city]));
      }
      if (!active) return;

      setData({
        loading: false,
        schedule,
        route,
        cities,
        taken: Array.isArray(takenPage?.seats) ? takenPage.seats.map(String) : [],
      });
    })();

    return () => {
      active = false;
    };
  }, [parsed.route_slug, parsed.operator_slug, parsed.departure_time, tripKey]);

  const trip = data.schedule ? buildTrip(data.schedule, parsed.travel_date) : null;

  const seatsKey = selected.join(',');

  useEffect(() => {
    if (!user?.id || !tripKey) {
      holdRef.current = null;
      setHold(null);
      return undefined;
    }
    if (!selected.length) {
      setHold(null);
      if (holdRef.current) {
        holdRef.current = null;
        fetch('/api/seats/hold', {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trip_key: tripKey }),
        }).catch(() => {});
      }
      return undefined;
    }
    let active = true;
    const seq = ++holdSeq.current;
    setHoldBusy(true);
    fetch('/api/seats/hold', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_key: tripKey, seats: selected }),
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          holdRef.current = null;
          setHold(null);
          setHoldNote(body.error || 'We could not hold those seats.');
          return;
        }
        if (seq !== holdSeq.current) return;
        const next = { expiresAt: Number(body.expires_at), seats: body.seats || selected };
        holdRef.current = next;
        setHold(next);
        setHoldNote('');
      })
      .catch(() => {
        if (active) setHoldNote('We could not reach the seat service — check your connection and try again.');
      })
      .finally(() => {
        if (active) setHoldBusy(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tripKey, seatsKey]);

  useEffect(() => {
    if (!hold) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hold]);

  const holdActive = Boolean(hold && now < hold.expiresAt);
  const holdRemaining = hold ? Math.max(0, hold.expiresAt - now) : 0;

  const toggleSeat = (label) => {
    if (selected.includes(label)) {
      setSelected(selected.filter((seat) => seat !== label));
      const remaining = { ...passengers };
      delete remaining[label];
      setPassengers(remaining);
      return;
    }
    if (selected.length >= wanted) {
      setError(`You can choose up to ${wanted} seat${wanted > 1 ? 's' : ''} for this search.`);
      return;
    }
    setSelected([...selected, label]);
    setPassengers({ ...passengers, [label]: { name: '', phone: '' } });
    setError('');
  };

  const updatePassenger = (seat, field, value) =>
    setPassengers((previous) => ({ ...previous, [seat]: { ...previous[seat], [field]: value } }));

  const proceed = async () => {
    if (selected.length !== wanted) {
      setError(`Please choose ${wanted} seat${wanted > 1 ? 's' : ''} on the seat map.`);
      return;
    }
    if (selected.some((seat) => !passengers[seat]?.name?.trim())) {
      setError('Add the full name of every passenger travelling.');
      return;
    }
    if (!contact.name.trim() || !contact.email.trim() || !contact.phone.trim()) {
      setError('Add a contact name, email and phone number so we can send the ticket.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!user?.id) {
      setError('Sign in to hold your seats and continue to payment.');
      return;
    }
    setError('');
    setOutboundMissing(false);
    if (!holdActive) {
      setHoldBusy(true);
      try {
        const response = await fetch('/api/seats/hold', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trip_key: tripKey, seats: selected }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(body.error || 'We could not hold your seats. Please try again.');
          return;
        }
        const next = { expiresAt: Number(body.expires_at), seats: body.seats || selected };
        holdRef.current = next;
        setHold(next);
        setHoldNote('');
      } catch {
        setError('We could not hold your seats. Please check your connection and try again.');
        return;
      } finally {
        setHoldBusy(false);
      }
    }
    const legDraft = {
      trip_key: trip.key,
      route_slug: data.schedule.route_slug,
      travel_date: parsed.travel_date,
      origin_city: data.schedule.origin_city,
      destination_city: data.schedule.destination_city,
      operator_name: data.schedule.operator_name,
      operator_slug: data.schedule.operator_slug,
      departure_time: data.schedule.departure_time,
      duration_minutes: data.schedule.duration_minutes,
      bus_class: data.schedule.bus_class,
      price: trip.price,
      currency: data.schedule.currency,
      seats: selected,
      passengers: selected.map((seat) => ({
        seat,
        name: passengers[seat]?.name?.trim() || '',
        phone: passengers[seat]?.phone?.trim() || '',
      })),
      passenger_count: selected.length,
      contact_name: contact.name.trim(),
      contact_email: contact.email.trim(),
      contact_phone: contact.phone.trim(),
      amount: Number(trip.price) * selected.length,
    };
    if (params.get('returning') === '1') {
      let outbound = null;
      try {
        outbound = JSON.parse(sessionStorage.getItem('yoo_return_draft') || 'null');
      } catch {
        outbound = null;
      }
      if (!outbound?.trip_key) {
        setOutboundMissing(true);
        setError('Your outbound selection is missing — pick the outbound trip first, then the return.');
        return;
      }
      sessionStorage.removeItem('yoo_return_draft');
      navigate('/checkout', {
        state: { draft: { legs: [outbound, legDraft], group_ref: crypto.randomUUID() } },
      });
      return;
    }
    const returnDate = params.get('return_date');
    if (returnDate) {
      sessionStorage.setItem('yoo_return_draft', JSON.stringify(legDraft));
      const returnParams = new URLSearchParams({
        from: data.route?.destination_slug || legDraft.route_slug.split('-').slice(0, -1).join('-'),
        to: data.route?.origin_slug || '',
        date: returnDate,
        passengers: String(wanted),
        return_date: returnDate,
        returning: '1',
      });
      navigate(`/search?${returnParams.toString()}`);
      return;
    }
    navigate('/checkout', { state: { draft: legDraft } });
  };

  if (data.loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_360px]">
          <Skeleton className="h-96 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-extrabold">This departure is no longer available</h1>
        <p className="mt-2 text-sm text-muted-foreground">The timetable may have changed. Please search again.</p>
        <Button asChild className="mt-6 rounded-xl">
          <Link to="/">Back to search</Link>
        </Button>
      </div>
    );
  }

  const schedule = data.schedule;
  const originCity = data.cities[data.route?.origin_slug];
  const destinationCity = data.cities[data.route?.destination_slug];
  const total = Number(trip.price) * (selected.length || wanted);
  const activeHoldSeats = holdActive ? hold.seats || [] : [];
  const displayTaken = data.taken.filter((seat) => !activeHoldSeats.includes(seat));
  const holdMinutes = Math.floor(holdRemaining / 60000);
  const holdSeconds = Math.floor((holdRemaining % 60000) / 1000);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        to={`/search?from=${data.route?.origin_slug || ''}&to=${data.route?.destination_slug || ''}&date=${parsed.travel_date}&passengers=${wanted}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to results
      </Link>

      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
        {schedule.origin_city} → {schedule.destination_city}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {schedule.operator_name} · {schedule.bus_class} coach · departs {trip.departureLabel} on {parsed.travel_date}
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="rounded-2xl border-border p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Choose your seats</h2>
              <div className="flex items-center gap-2">
                {holdActive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    <Timer className="h-3.5 w-3.5" />
                    Held for {holdMinutes}:{String(holdSeconds).padStart(2, '0')}
                  </span>
                )}
                <span className="text-sm text-muted-foreground">
                  {selected.length} of {wanted} selected
                </span>
              </div>
            </div>
            <div className="mt-4">
              <SeatMap
                total={schedule.seats_total}
                layout={schedule.seat_layout || '2x2'}
                taken={displayTaken}
                selected={selected}
                onToggle={toggleSeat}
              />
            </div>
          </Card>

          {selected.length > 0 && (
            <div>
              <h2 className="font-display text-lg font-bold">Passenger details</h2>
              <div className="mt-4">
                <PassengerFields seats={selected} passengers={passengers} onChange={updatePassenger} />
              </div>
            </div>
          )}

          <Card className="rounded-2xl border-border p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">Contact details</h2>
            <p className="mt-1 text-sm text-muted-foreground">We send the e-ticket and any travel updates here.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="contact-name" className="text-xs font-semibold text-muted-foreground">
                  Full name
                </Label>
                <Input
                  id="contact-name"
                  className="mt-1"
                  value={contact.name}
                  onChange={(event) => setContact({ ...contact, name: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contact-email" className="text-xs font-semibold text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="contact-email"
                  type="email"
                  className="mt-1"
                  value={contact.email}
                  onChange={(event) => setContact({ ...contact, email: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="contact-phone" className="text-xs font-semibold text-muted-foreground">
                  Phone
                </Label>
                <Input
                  id="contact-phone"
                  className="mt-1"
                  value={contact.phone}
                  onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                />
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border-border p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">Boarding &amp; conditions</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Departure</p>
                  <p className="text-sm text-muted-foreground">
                    {originCity?.station_name || schedule.origin_city}
                    {originCity?.station_address ? `, ${originCity.station_address}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Arrival</p>
                  <p className="text-sm text-muted-foreground">
                    {destinationCity?.station_name || schedule.destination_city}
                    {destinationCity?.station_address ? `, ${destinationCity.station_address}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Check-in</p>
                  <p className="text-sm text-muted-foreground">
                    Arrive 30 minutes early. Boarding closes 10 minutes before departure.
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Luggage</p>
                  <p className="text-sm text-muted-foreground">
                    Two bags included in the hold, one small bag with you on board.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(schedule.amenities || []).map((amenity) => (
                <span key={amenity} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-primary">
                  {amenity}
                </span>
              ))}
            </div>
          </Card>
        </div>

        <aside>
          <div className="sticky top-24 space-y-4">
            <TripSummary
              operatorName={schedule.operator_name}
              originCity={schedule.origin_city}
              destinationCity={schedule.destination_city}
              travelDate={parsed.travel_date}
              departureLabel={trip.departureLabel}
              arrivalLabel={trip.arrivalLabel}
              nextDay={trip.nextDay}
              durationMinutes={schedule.duration_minutes}
              busClass={schedule.bus_class}
              seats={selected}
              passengerCount={wanted}
            />

            <Card className="rounded-2xl border-border p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">
                {formatMoney(trip.price, schedule.currency)} × {selected.length || wanted}{' '}
                {(selected.length || wanted) === 1 ? 'passenger' : 'passengers'}
              </p>
              <div className="mt-2 flex items-end justify-between">
                <span className="font-medium">Total</span>
                <span className="font-display text-2xl font-extrabold">{formatMoney(total, schedule.currency)}</span>
              </div>
              <Button
                className="mt-4 h-12 w-full rounded-xl text-base font-semibold"
                onClick={proceed}
                disabled={holdBusy}
              >
                {holdBusy ? 'Holding your seats…' : 'Continue to payment'}
              </Button>
              {hold && !holdActive && (
                <p className="mt-3 text-sm text-destructive">
                  Your seat hold expired — click continue to re-hold, or change your seats.
                </p>
              )}
              {holdNote && <p className="mt-3 text-sm text-destructive">{holdNote}</p>}
              {error && (
                <Alert variant="destructive" className="mt-3 rounded-xl">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {outboundMissing && (
                <Button asChild variant="outline" size="sm" className="mt-3 rounded-lg">
                  <Link to="/">Start a new search</Link>
                </Button>
              )}
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}