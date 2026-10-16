import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

function initialsOf(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export default function OperatorAvatar({ name, color = '#0084ff', size = 'md', className = '', src = '' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const boxClass = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-xl object-cover', boxClass, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl font-display font-bold text-white',
        boxClass,
        className
      )}
      style={{ backgroundColor: color }}
    >
      {initialsOf(name)}
    </span>
  );
}
