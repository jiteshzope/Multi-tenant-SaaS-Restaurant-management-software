import { useEffect, useState } from 'react';

/**
 * Ticks locally from a server-provided baseline. Using `ageSeconds` from the
 * API rather than `Date.now() - placedAt` means a wrong client clock cannot
 * make a ten-minute-old order look fresh.
 */
export function useElapsed(baselineSeconds: number, tickMs = 1000): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
    const start = Date.now();
    const id = setInterval(() => setOffset(Math.floor((Date.now() - start) / 1000)), tickMs);
    return () => clearInterval(id);
  }, [baselineSeconds, tickMs]);

  return baselineSeconds + offset;
}
