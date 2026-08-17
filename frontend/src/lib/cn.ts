import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** clsx + tailwind-merge — the last conflicting utility class wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
