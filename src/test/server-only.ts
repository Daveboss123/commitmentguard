/**
 * Vitest runs in a plain Node process, not inside the React Server Component
 * runtime, so the `server-only` guard is a no-op here. Production builds still
 * enforce it.
 */
export {};
