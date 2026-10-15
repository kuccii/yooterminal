import db from '@/api/client';

import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Download, Printer } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadCsv } from '@/lib/csv';
import { formatMoney, todayISO } from '@/lib/format';

function departureKey(booking) {
  return (
    booking.trip_key ||
    `${booking.travel_date}|${booking.departure_time}|${booking.origin_city}->${booking.destination_city}`
  );
}

function departureLabel(bookings) {
  const first = bookings[0];
  return `${first.travel_date} ${first.departure_time} · ${first.origin_city} → ${first.destination_city}`;
}

function seatCompare(a, b) {
  const na = Number(a.seat);
  const nb = Number(b.seat);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a.seat).localeCompare(String(b.seat), undefined, { numeric: true });
}

const CSV_COLUMNS = [
  { label: 'seat', value: (row) => row.seat },
  { label: 'passenger_name', value: (row) => row.name },
  { label: 'contact_name', value: (row) => row.booking.contact_name },
  { label: 'contact_phone', value: (row) => row.booking.contact_phone },
  { label: 'contact_email', value: (row) => row.booking.contact_email },
  { label: 'booking_ref', value: (row) => row.booking.booking_ref },
  { label: 'amount', value: (row) => row.booking.amount },
  { label: 'currency', value: (row) => row.booking.currency || 'UGX' },
  { label: 'payment_status', value: (row) => row.booking.status },
  { label: 'boarded', value: (row) => (row.booking.validated ? 'yes' : 'no') },
  { label: 'travel_date', value: (row) => row.booking.travel_date },
  { label: 'departure_time', value: (row) => row.booking.departure_time },
  { label: 'origin_city', value: (row) => row.booking.origin_city },
  { label: 'destination_city', value: (row) => row.booking.destination_city },
];

export default function OperatorManifest({ operator }) {
  const [state, setState] = useState({ loading: true, departures: [] });
  const [picked, setPicked] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      const page = await db.entities.Booking.filter(
        { operator_slug: operator.slug, status: 'paid', travel_date: { $gte: todayISO() } },
        {
          sort: 'travel_date',
          limit: 200,
          fields: [
            'trip_key',
            'travel_date',
            'departure_time',
            'origin_city',
            'destination_city',
            'booking_ref',
            'seats',
            'passengers',
            'contact_name',
            'contact_phone',
            'contact_email',
            'amount',
            'currency',
            'status',
            'validated',
          ],
        }
      );
      if (!active) return;

      const map = new Map();
      (page.items || []).forEach((booking) => {
        const key = departureKey(booking);
        const list = map.get(key) || [];
        list.push(booking);
        map.set(key, list);
      });
      const departures = [...map.entries()]
        .map(([key, bookings]) => ({ key, label: departureLabel(bookings), bookings }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setState({ loading: false, departures });
      if (departures.length) setPicked((prev) => prev || departures[0].key);
    })();

    return () => {
      active = false;
    };
  }, [operator.slug]);

  const departure = state.departures.find((entry) => entry.key === picked) || null;

  const rows = useMemo(() => {
    if (!departure) return [];
    const list = [];
    departure.bookings.forEach((booking) => {
      const seats = booking.seats || [];
      const passengers = booking.passengers || [];
      seats.forEach((seat, index) => {
        list.push({ seat, name: passengers[index]?.name || '', booking });
      });
    });
    return list.sort(seatCompare);
  }, [departure]);

  const boarded = departure ? departure.bookings.filter((booking) => booking.validated).length : 0;
  const generatedAt = format(new Date(), 'yyyy-MM-dd HH:mm');

  const exportCsv = () => {
    downloadCsv(`manifest-${operator.slug}-${departure?.key || 'departure'}.csv`, CSV_COLUMNS, rows);
  };

  if (state.loading) {
    return <Skeleton className="h-64 w-full rounded-3xl" />;
  }

  if (!state.departures.length) {
    return <p className="text-sm text-muted-foreground">No upcoming departures with paid bookings.</p>;
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Departure</p>
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.departures.map((entry) => (
                <SelectItem key={entry.key} value={entry.key}>
                  {entry.label} ({entry.bookings.length} booking{entry.bookings.length === 1 ? '' : 's'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {departure && (
        <div className="manifest-print mt-5">
          <div className="border-b border-border pb-4">
            <h3 className="font-display text-lg font-extrabold">{operator.name}</h3>
            <p className="mt-0.5 text-sm font-semibold">{departure.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rows.length} seat{rows.length === 1 ? '' : 's'} · {departure.bookings.length} booking
              {departure.bookings.length === 1 ? '' : 's'} · {boarded} boarded · generated {generatedAt}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seat</TableHead>
                  <TableHead>Passenger</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Boarded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${row.booking.id}-${row.seat}-${index}`}>
                    <TableCell className="font-semibold">{row.seat}</TableCell>
                    <TableCell className="text-sm">{row.name || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {row.booking.contact_name}
                      <span className="block text-xs text-muted-foreground">
                        {[row.booking.contact_phone, row.booking.contact_email].filter(Boolean).join(' · ')}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs tracking-wider">{row.booking.booking_ref}</TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="secondary">{row.booking.status}</Badge>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatMoney(row.booking.amount, row.booking.currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.booking.validated ? (
                        <Badge className="bg-[hsl(var(--trust))] text-white">
                          <CheckCircle2 className="h-3 w-3" /> boarded
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">not yet</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      No seats booked on this departure.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
