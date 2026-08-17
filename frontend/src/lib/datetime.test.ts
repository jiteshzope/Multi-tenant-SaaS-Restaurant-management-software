import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration } from './datetime';

/**
 * The kitchen card's elapsed timer. It runs off the server's `ageSeconds` and
 * ticks locally, so it has to stay readable for an order that has been sitting
 * for hours as well as one placed a moment ago.
 */
describe('formatClock', () => {
  it('reads as a mm:ss stopwatch under an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(599)).toBe('9:59');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('switches to hours past the hour mark', () => {
    // 279 minutes used to render as "279:40" — a number nobody can convert to
    // "how late is this" mid-service.
    expect(formatClock(3600)).toBe('1h 00m');
    expect(formatClock(16_780)).toBe('4h 39m');
    expect(formatClock(86_399)).toBe('23h 59m');
  });

  it('never renders a negative or fractional clock', () => {
    expect(formatClock(-30)).toBe('0:00');
    expect(formatClock(90.7)).toBe('1:30');
  });
});

describe('formatDuration', () => {
  it('drops the largest empty unit', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(3660)).toBe('1h 01m');
  });

  it('clamps below zero', () => {
    expect(formatDuration(-5)).toBe('0s');
  });
});
