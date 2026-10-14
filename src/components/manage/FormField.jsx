import React from 'react';
import { Label } from '@/components/ui/label';

export default function FormField({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>}
      <div className={label ? 'mt-1' : ''}>{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}