import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A scroll container that says so.
 *
 * A pane whose content simply stops at a hard edge reads as *trimmed* — the
 * reader has no way to tell a cut-off card from a scrollable one. This paints a
 * fade on whichever edge still has content behind it, and nothing at all when
 * everything fits. CSS cannot do that on its own: `overflow` tells you the
 * element scrolls, never whether you are at the end of it, so the edges are
 * measured.
 *
 * The fades are `pointer-events-none` overlays, so they never eat a tap on the
 * card underneath.
 */
export function Scroller({
  children,
  orientation = 'x',
  className,
  viewportClassName,
  fadeSize = 40,
  ...rest
}: {
  children: ReactNode;
  orientation?: 'x' | 'y';
  className?: string;
  viewportClassName?: string;
  /** Length of the fade in px, along the scroll axis. */
  fadeSize?: number;
} & Omit<React.ComponentProps<'div'>, 'children' | 'className'>) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const [pos, size, scrollSize] =
      orientation === 'x'
        ? [el.scrollLeft, el.clientWidth, el.scrollWidth]
        : [el.scrollTop, el.clientHeight, el.scrollHeight];

    // 1px of slack: fractional layout sizes otherwise leave a fade stuck on.
    setEdges((prev) => {
      const next = { start: pos > 1, end: pos + size < scrollSize - 1 };
      return prev.start === next.start && prev.end === next.end ? prev : next;
    });
  }, [orientation]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measure();
    el.addEventListener('scroll', measure, { passive: true });

    // Content and container both change size — new orders arrive on the kitchen
    // board, the sidebar collapses, the phone rotates.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);

    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, children]);

  const horizontal = orientation === 'x';

  return (
    <div className={cn('relative min-h-0 min-w-0', className)}>
      <div
        ref={ref}
        className={cn(
          'scroll-touch min-h-0 min-w-0',
          /*
            Vertical scrollers get *both* height rules, because callers bound
            their height in one of two different ways and each needs its own.

            `max-h-[inherit]` covers a wrapper that carries a cap — the kitchen
            column's `md:max-h-[calc(100vh-15rem)]`, the menu rail's
            `max-h-[22rem]`. Such a wrapper has no definite height, so `h-full`
            alone resolved to `auto`: this element grew to the full content
            height and nothing ever scrolled, because the overflow sat on one
            element and the cap on another. Inheriting the cap puts both on the
            element that actually scrolls.

            `h-full` covers a wrapper stretched by a flex parent — the take-order
            category rail, which has no cap of its own and simply fills the row.
            There the parent height *is* definite and `max-height` inherits as
            `none`.

            They are different properties, so whichever one does not apply in a
            given layout is inert rather than in conflict.
          */
          horizontal
            ? 'overflow-x-auto overflow-y-hidden'
            : 'h-full max-h-[inherit] overflow-y-auto',
          viewportClassName,
        )}
        {...rest}
      >
        {children}
      </div>

      <Fade show={edges.start} side={horizontal ? 'left' : 'top'} size={fadeSize} />
      <Fade show={edges.end} side={horizontal ? 'right' : 'bottom'} size={fadeSize} />
    </div>
  );
}

function Fade({
  show,
  side,
  size,
}: {
  show: boolean;
  side: 'left' | 'right' | 'top' | 'bottom';
  size: number;
}) {
  const horizontal = side === 'left' || side === 'right';
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute z-10 bg-gradient-to-r from-background to-transparent transition-opacity duration-200',
        horizontal ? 'inset-y-0' : 'inset-x-0',
        side === 'left' && 'left-0',
        side === 'right' && 'right-0 bg-gradient-to-l',
        side === 'top' && 'top-0 bg-gradient-to-b',
        side === 'bottom' && 'bottom-0 bg-gradient-to-t',
        show ? 'opacity-100' : 'opacity-0',
      )}
      style={horizontal ? { width: size } : { height: size }}
    />
  );
}
