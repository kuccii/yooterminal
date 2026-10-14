import React from 'react';
import { Link } from 'react-router-dom';
import { BusFront } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BrandMark({ className, to = '/' }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <BusFront className="h-5 w-5" />
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight text-foreground">buslink</span>
    </Link>
  );
}