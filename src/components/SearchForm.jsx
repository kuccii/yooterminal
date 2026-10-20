import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CityPicker from '@/components/CityPicker';
import DateField from '@/components/DateField';
import PassengerField from '@/components/PassengerField';
import { useCities } from '@/hooks/useCities';
import { useSiteContent } from '@/lib/SiteContentContext';
import { shiftDays, todayISO } from '@/lib/format';

export default function SearchForm({ initialFrom, initialTo, initialDate, initialPassengers, initialReturnDate, className, onSearch }) {
  const cities = useCities();
  const { content } = useSiteContent();
  const roundTrips = content.round_trip_enabled === true;
  const navigate = useNavigate();
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [date, setDate] = useState(initialDate || todayISO());
  const [passengers, setPassengers] = useState(initialPassengers || 1);
  const [tripType, setTripType] = useState(initialReturnDate ? 'return' : 'oneway');
  const [returnDate, setReturnDate] = useState(initialReturnDate || shiftDays(initialDate || todayISO(), 7));
  const [error, setError] = useState('');

  useEffect(() => {
    if (resolved || !cities.length) return;
    setFrom(cities.find((city) => city.slug === initialFrom) || null);
    setTo(cities.find((city) => city.slug === initialTo) || null);
    setResolved(true);
  }, [cities, resolved, initialFrom, initialTo]);

  useEffect(() => {
    if (returnDate < date) setReturnDate(date);
  }, [date, returnDate]);

  useEffect(() => {
    if (!roundTrips) setTripType('oneway');
  }, [roundTrips]);

  const isReturn = roundTrips && tripType === 'return';

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!from || !to) {
      setError('Choose where you are leaving from and going to.');
      return;
    }
    if (from.slug === to.slug) {
      setError('Your departure and arrival cities must be different.');
      return;
    }
    if (isReturn && returnDate < date) {
      setError('Your return date cannot be before your outbound date.');
      return;
    }
    setError('');
    const params = new URLSearchParams({
      from: from.slug,
      to: to.slug,
      date,
      passengers: String(passengers),
    });
    if (isReturn) params.set('return_date', returnDate);
    if (onSearch) {
      onSearch(params);
    } else {
      navigate(`/search?${params.toString()}`);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={className || 'rounded-3xl border border-border bg-card p-2 shadow-[0_18px_44px_-24px_rgba(15,23,42,0.35)]'}
    >
      <div className="grid items-center gap-1 md:grid-cols-[1.15fr_auto_1.15fr_auto_1fr_auto_1fr_auto]">
        <CityPicker cities={cities} value={from} onChange={setFrom} label="Origin" placeholder="Leaving from…" />
        <button
          type="button"
          onClick={swap}
          aria-label="Swap cities"
          className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </button>
        <CityPicker cities={cities} value={to} onChange={setTo} label="Destination" placeholder="Going to…" />
        <DateField value={date} onChange={setDate} />
        <PassengerField value={passengers} onChange={setPassengers} />
        <Button type="submit" size="lg" className="h-12 rounded-2xl px-6 text-base font-semibold md:mx-1">
          <Search className="mr-1.5 h-4 w-4" />
          Search
        </Button>
      </div>
      {roundTrips && (
        <div className="flex flex-wrap items-center gap-3 px-2 pb-2 pt-1">
          <div className="flex rounded-full border border-border p-0.5">
            {[
              ['oneway', 'One-way'],
              ['return', 'Return'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTripType(id)}
                className={`rounded-full px-3.5 py-1 text-sm font-semibold transition ${
                  tripType === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {isReturn && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Coming back</span>
              <DateField value={returnDate} onChange={setReturnDate} />
            </div>
          )}
        </div>
      )}
      {error && <p className="px-3 pb-2 pt-1 text-sm font-medium text-destructive">{error}</p>}
    </form>
  );
}