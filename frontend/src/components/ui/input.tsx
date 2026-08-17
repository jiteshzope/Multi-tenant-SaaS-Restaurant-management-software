import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** React 19: `ref` is a normal prop. No forwardRef. */
export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-lg border border-input bg-card/40 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70',
        'focus-visible:border-ring/60 focus-visible:bg-card',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/25',
        'file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  );
}
