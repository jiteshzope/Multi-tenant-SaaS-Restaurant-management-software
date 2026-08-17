import { Prisma } from '@prisma/client';
import { constraintTarget, constraintTouches } from './prisma-error';

/**
 * `meta.target` is typed `unknown` and arrives in more than one shape. The old
 * `String(e.meta?.target ?? '')` handled the common one by luck; these pin down
 * the ones it got wrong, because a miss here downgrades a 409 EMAIL_TAKEN to an
 * unhandled 500.
 */
function p2002(target: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('constraintTarget', () => {
  it('reads the usual string[] shape', () => {
    expect(constraintTarget(p2002(['email']))).toBe('email');
    expect(constraintTarget(p2002(['restaurant_id', 'name']))).toBe('restaurant_id,name');
  });

  it('reads a bare string', () => {
    expect(constraintTarget(p2002('users_email_key'))).toBe('users_email_key');
  });

  it('returns empty rather than "[object Object]" for anything else', () => {
    expect(constraintTarget(p2002({ constraint: 'users_email_key' }))).toBe('');
    expect(constraintTarget(p2002(undefined))).toBe('');
    expect(constraintTarget(p2002(null))).toBe('');
    expect(constraintTarget(p2002(42))).toBe('');
  });

  it('drops non-string members of the array', () => {
    expect(constraintTarget(p2002(['email', 7, null]))).toBe('email');
  });
});

describe('constraintTouches', () => {
  it('matches a column named in the constraint', () => {
    expect(constraintTouches(p2002(['email']), 'email')).toBe(true);
    expect(constraintTouches(p2002('users_email_key'), 'email')).toBe(true);
  });

  it('is case-insensitive, because index names are not consistent', () => {
    expect(constraintTouches(p2002(['Email']), 'email')).toBe(true);
    expect(constraintTouches(p2002('UQ_ONE_ACTIVE_KITCHEN'), 'kitchen')).toBe(true);
  });

  it('requires every named column', () => {
    expect(constraintTouches(p2002(['restaurant_id', 'name']), 'restaurant_id', 'name')).toBe(true);
    expect(constraintTouches(p2002(['restaurant_id']), 'restaurant_id', 'name')).toBe(false);
  });

  it('does not match when the target is an unreadable shape', () => {
    // The old String() coercion produced "[object Object]" here, and any
    // .includes() check against it silently returned false.
    expect(constraintTouches(p2002({ constraint: 'users_email_key' }), 'email')).toBe(false);
  });
});
