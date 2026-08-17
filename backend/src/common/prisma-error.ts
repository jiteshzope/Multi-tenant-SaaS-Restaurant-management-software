import { Prisma } from '@prisma/client';

/**
 * Which columns a Prisma constraint error fired on, as searchable text.
 *
 * `PrismaClientKnownRequestError.meta` is typed `Record<string, unknown>`, and
 * `meta.target` is not one shape: it is usually `string[]` (`['email']`), but
 * the driver also returns a bare string for some constraints, and nothing at
 * all when it cannot name the index.
 *
 * Call sites used to write `String(e.meta?.target ?? '')`. That happens to work
 * for an array, but if `target` ever arrives as an object it stringifies to the
 * literal `[object Object]` — and then a check like `target.includes('email')`
 * quietly returns false, so a duplicate email surfaces as an unhandled 500
 * instead of 409 EMAIL_TAKEN. Normalising the shape here removes that whole
 * class of silent miss.
 */
export function constraintTarget(e: Prisma.PrismaClientKnownRequestError): string {
  const target: unknown = e.meta?.target;

  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.filter((t) => typeof t === 'string').join(',');
  return '';
}

/** True when the failed constraint names every one of `columns`. */
export function constraintTouches(
  e: Prisma.PrismaClientKnownRequestError,
  ...columns: string[]
): boolean {
  const target = constraintTarget(e).toLowerCase();
  return columns.every((c) => target.includes(c.toLowerCase()));
}
