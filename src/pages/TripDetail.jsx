import db from '@/api/client';

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, MapPin } from 'lucide-react';

import SeatMap from '@/components/SeatMap';
import TripSummary from '@/components/TripSummary';
import PassengerFields from '@/components/PassengerFields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { buildTrip, parseTripKey } from '@/lib/trips';
import { formatMoney } from '@/lib/format';

export default function TripDetail() {
  const { tripKey = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const wanted = Number(params.get('passengers') || 1);

  const parsed = useMemo(() => parseTripKey(tripKey), [tripKey]);

  const [data, setData] = useState({ loading: true, schedule: null, route: null, cities: {}, taken: [] });
  const [selected, setSelected] = useState([]);
  const [passengers, setPassengers] = useState({});
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');

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

      const [routePage, heldPage] = await Promise.all([
        db.entities.Route.filter({ slug: parsed.route_slug }, { limit: 1 }),
        db.entities.DepartureSeat.filter({ trip_key: tripKey }, { limit: 200, fields: ['seats'] }),
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
        taken: (heldPage.items || []).flatMap((record) => record.seats || []),
      });
    })();

    return () => {
      active = false;
    };
  }, [parsed.route_slug, parsed.operator_slug, parsed.departure_time, tripKey]);

  const trip = data.schedule ? buildTrip(data.schedule, parsed.travel_date) : null;

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

  const proceed = () => {
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
    setError('');
    const draft = {
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
    navigate('/checkout', { state: { draft } });
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
              <span className="text-sm text-muted-foreground">
                {selected.length} of {wanted} selected
              </span>
            </div>
            <div className="mt-4">
              <SeatMap
                total={schedule.seats_total}
                layout={schedule.seat_layout || '2x2'}
                taken={data.taken}
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
              <Button className="mt-4 h-12 w-full rounded-xl text-base font-semibold" onClick={proceed}>
                Continue to payment
              </Button>
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