import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import type { ConnectionState } from '@/hooks/useSocket';

const STATES: Record<
  ConnectionState,
  { dot: string; text: string; chip: string; label: string; hint: string }
> = {
  connected: {
    dot: 'bg-status-completed',
    text: 'text-status-completed',
    chip: 'border-status-completed/35 bg-status-completed/12',
    label: 'Live',
    hint: 'Realtime connected — updates arrive instantly.',
  },
  reconnecting: {
    dot: 'bg-status-pending',
    text: 'text-status-pending',
    chip: 'border-status-pending/35 bg-status-pending/12',
    label: 'Reconnecting',
    hint: 'Realtime dropped. Falling back to a 15-second refresh.',
  },
  offline: {
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    chip: 'border-border/60 bg-card/40',
    label: 'Polling',
    hint: 'No realtime connection. Screens refresh every 15 seconds.',
  },
};

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const { dot, text, chip, label, hint } = STATES[state];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs sm:gap-2 sm:px-2.5',
            chip,
          )}
          aria-label={`Connection: ${label}`}
        >
          <span className="relative flex size-2">
            {state === 'connected' && (
              <span
                className={cn(
                  'absolute inline-flex size-2 animate-ping rounded-full opacity-60',
                  dot,
                )}
              />
            )}
            <span className={cn('relative inline-flex size-2 rounded-full', dot)} />
          </span>
          <span className={cn('hidden font-medium sm:inline', text)}>{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
