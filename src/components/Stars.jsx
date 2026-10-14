import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Stars({ rating = 0, className = '', size = 'sm' }) {
  const rounded = Math.round(Number(rating) || 0);
  return (
    <span className={cn('flex items-center gap-0.5', className)} aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn(
            size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5',
            value <= rounded ? 'fill-[hsl(var(--trust))] text-[hsl(var(--trust))]' : 'text-border'
          )}
        />
      ))}
    </span>
  );
}