import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function ScrollArea({
  className,
  children,
  viewportClassName,
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Root> & { viewportClassName?: string }) {
  return (
    <ScrollAreaPrimitive.Root className={cn('relative overflow-hidden', className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        className={cn('size-full rounded-[inherit]', viewportClassName)}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex w-2.5 touch-none p-0.5 transition-colors select-none"
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
