import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const STATUS_VARIANTS = {
  approved: 'default',
  pending: 'secondary',
  suspended: 'destructive',
};

export function StatusPill({ status }) {
  return <Badge variant={STATUS_VARIANTS[status] || 'secondary'}>{status || 'pending'}</Badge>;
}

export function routeLabel(row, routes) {
  if (row.origin_city || row.destination_city) {
    return `${row.origin_city || '?'} → ${row.destination_city || '?'}`;
  }
  const route = routes?.find((entry) => entry.slug === row.route_slug);
  return route ? `${route.origin_city} → ${route.destination_city}` : row.route_slug || '—';
}

export function seatsLabel(row) {
  if (Array.isArray(row.seats)) return row.seats.join(', ');
  if (row.passenger_count) return String(row.passenger_count);
  return '—';
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

export default function ReportDrilldown({
  open,
  onOpenChange,
  title,
  description,
  columns,
  rows,
  initialSort,
  rowKey,
  empty = 'No rows yet.',
  footer,
}) {
  const [sort, setSort] = useState({ key: initialSort || columns[0]?.key, dir: 'desc' });

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    if (!key) return rows;
    const factor = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(a[key], b[key]) * factor);
  }, [rows, sort]);

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  };

  const keyFor = (row, index) => {
    if (rowKey) return rowKey(row);
    return row.id ?? index;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="mt-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.align === 'right' ? 'text-right' : undefined}>
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={`flex items-center gap-1 font-semibold text-foreground transition-colors hover:text-primary${
                        column.align === 'right' ? ' w-full justify-end' : ''
                      }`}
                    >
                      {column.label}
                      {sort.key === column.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row, index) => (
                <TableRow key={keyFor(row, index)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.align === 'right' ? 'text-right' : undefined}>
                      {column.render ? column.render(row) : row[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!sorted.length && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-sm text-muted-foreground">
                    {empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}
