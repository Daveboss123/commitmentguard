import "server-only";

/**
 * Server components must not call `Date.now()` during render (purity rule).
 * All wall-clock reads on the server go through this helper so the time source
 * lives in plain module code, not in component scope.
 */
export function serverNow(): number {
  return Date.now();
}
