import React from 'react';
import { cn } from '@/lib/utils';

function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export default function OperatorAvatar({ name, color = '#0084ff', size = 'md', className = '' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl font-display font-bold text-white',
        size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm',
        className
      )}
      style={{ backgroundColor: color }}
    >
      {initialsOf(name)}
    </span>
  );
}