import { describe, expect, it } from 'vitest';
import { postLoginPath, ROLE_HOME } from './constants';

/**
 * `ProtectedRoute` parks the attempted path in `?next=`, and the login screen
 * replays it. Two things have to hold: the role signing in must be allowed
 * there, and the value is query-string text so it must not be trusted.
 */
describe('postLoginPath', () => {
  it('falls back to the role home when there is no next', () => {
    expect(postLoginPath(null, 'OWNER')).toBe(ROLE_HOME.OWNER);
    expect(postLoginPath(undefined, 'WAITER')).toBe(ROLE_HOME.WAITER);
    expect(postLoginPath('', 'KITCHEN')).toBe(ROLE_HOME.KITCHEN);
  });

  it('follows next when the role owns that branch', () => {
    expect(postLoginPath('%2Fowner%2Fkitchen', 'OWNER')).toBe('/owner/kitchen');
    expect(postLoginPath('/owner/tables/abc/order', 'OWNER')).toBe('/owner/tables/abc/order');
    expect(postLoginPath('/waiter/tables/xyz', 'WAITER')).toBe('/waiter/tables/xyz');
    expect(postLoginPath('/kitchen', 'KITCHEN')).toBe('/kitchen');
  });

  it('keeps the query string on an allowed path', () => {
    expect(postLoginPath('%2Fowner%2Freports%3Frange%3D30', 'OWNER')).toBe(
      '/owner/reports?range=30',
    );
  });

  // The reported bug: an owner's session drops on /owner/kitchen, a waiter
  // signs in on the same tablet, and lands on 403 straight after a successful
  // login.
  it('ignores next when the role may not go there', () => {
    expect(postLoginPath('%2Fowner%2Fkitchen', 'WAITER')).toBe('/waiter');
    expect(postLoginPath('%2Fowner%2Ftables', 'KITCHEN')).toBe('/kitchen');
    expect(postLoginPath('/kitchen', 'WAITER')).toBe('/waiter');
    expect(postLoginPath('/waiter', 'OWNER')).toBe('/owner');
  });

  it('does not treat a prefix collision as the same branch', () => {
    // `/waiterly` must not pass as being inside `/waiter`.
    expect(postLoginPath('/waiterly/secrets', 'WAITER')).toBe('/waiter');
    expect(postLoginPath('/ownership', 'OWNER')).toBe('/owner');
  });

  it('discards anything that is not a same-origin absolute path', () => {
    expect(postLoginPath('%2F%2Fexample.com%2Fx', 'WAITER')).toBe('/waiter');
    expect(postLoginPath('https://example.com/owner', 'OWNER')).toBe('/owner');
    expect(postLoginPath('/\\example.com', 'OWNER')).toBe('/owner');
    expect(postLoginPath('owner/tables', 'OWNER')).toBe('/owner');
    expect(postLoginPath('javascript:alert(1)', 'OWNER')).toBe('/owner');
  });

  it('survives malformed percent-encoding', () => {
    expect(postLoginPath('%E0%A4%A', 'OWNER')).toBe('/owner');
  });
});
