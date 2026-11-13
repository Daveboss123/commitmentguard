import "server-only";
import { ApiError } from "@/lib/http/errors";

const COMPARE_AND_SET = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

/** A small shared demo store, not a production multi-tenant database. */
export function createRedisSnapshotStore<T>(options: {
  url: string;
  token: string;
  key: string;
  seed: () => T;
  validate: (value: unknown) => value is T;
  fetcher?: typeof fetch;
}) {
  const fetcher = options.fetcher ?? fetch;

  async function command(args: Array<string | number>): Promise<unknown> {
    try {
      const response = await fetcher(options.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json() as { result?: unknown; error?: unknown };
      if (!response.ok || body.error || !("result" in body)) throw new Error();
      return body.result;
    } catch {
      // Do not log response bodies, credentials, or pretend a failed write worked.
      throw new ApiError("STORAGE_UNAVAILABLE", "Shared demo storage is unavailable. No successful write is claimed.");
    }
  }

  async function snapshot(): Promise<{ raw: string; value: T }> {
    let raw = await command(["GET", options.key]);
    if (raw === null) {
      // NX makes concurrent cold starts seed only an absent key. Never replace
      // existing or corrupt data with fixtures.
      await command(["SET", options.key, JSON.stringify(options.seed()), "NX"]);
      raw = await command(["GET", options.key]);
    }
    try {
      if (typeof raw !== "string") throw new Error();
      const value: unknown = JSON.parse(raw);
      if (!options.validate(value)) throw new Error();
      return { raw, value };
    } catch {
      throw new ApiError("STORAGE_UNAVAILABLE", "Shared demo data has an unsupported format. It was not reset or overwritten.");
    }
  }

  return {
    async read(): Promise<T> {
      return (await snapshot()).value;
    },
    async mutate<R>(mutator: (value: T) => R | Promise<R>): Promise<R> {
      // Callbacks must only edit the supplied snapshot. SERV/Kite calls belong
      // outside them: a CAS conflict can repeat this callback, never a payment.
      for (let attempt = 0; attempt < 8; attempt++) {
        const { raw, value } = await snapshot();
        const result = await mutator(value);
        const next = JSON.stringify(value);
        const committed = await command(["EVAL", COMPARE_AND_SET, 1, options.key, raw, next]);
        if (committed === 1) return result;
        if (committed !== 0) {
          throw new ApiError("STORAGE_UNAVAILABLE", "Shared storage did not confirm the write. No success is claimed.");
        }
      }
      throw new ApiError("CONFLICT", "The shared ledger changed concurrently. Refresh and retry; this mutation was not committed.");
    },
  };
}
