import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function BrandMark({ className, to = '/' }) {
  return (
    <Link to={to} className={cn('flex items-center', className)}>
      <img src="/images/yooterminal-wordmark.png" alt="YooTerminal" className="h-9 w-auto" />
    </Link>
  );
}