import { describe, expect, it, vi } from "vitest";
import { createRedisSnapshotStore } from "../redis-snapshot";

function harness() {
  const values = new Map<string, string>();
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const [command, ...args] = JSON.parse(String(init?.body)) as Array<string | number>;
    let result: unknown = null;
    if (command === "GET") result = values.get(String(args[0])) ?? null;
    if (command === "SET" && !values.has(String(args[0]))) {
      values.set(String(args[0]), String(args[1]));
      result = "OK";
    }
    if (command === "EVAL") {
      const key = String(args[2]);
      result = values.get(key) === args[3] ? 1 : 0;
      if (result === 1) values.set(key, String(args[4]));
    }
    return Response.json({ result });
  }) as unknown as typeof fetch;
  const create = () => createRedisSnapshotStore({
    url: "https://redis.test",
    token: "test-only",
    key: "commitmentguard:test",
    seed: () => ({ count: 0 }),
    validate: (v): v is { count: number } => Boolean(v && typeof v === "object" && "count" in v),
    fetcher,
  });
  return { values, fetcher, create };
}

describe("shared Redis snapshot store", () => {
  it("reads another instance's writes without a process-local stale cache", async () => {
    const { create } = harness();
    const a = create();
    const b = create();
    await a.read();
    await b.mutate((db) => { db.count++; });
    expect((await a.read()).count).toBe(1);
  });

  it("replays database-only mutations after an atomic CAS conflict", async () => {
    const { create } = harness();
    const a = create();
    const b = create();
    await a.read();
    let conflict = true;
    const mutate = vi.fn(async (db: { count: number }) => {
      if (conflict) {
        conflict = false;
        await b.mutate((other) => { other.count += 2; });
      }
      db.count++;
    });
    await a.mutate(mutate);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect((await a.read()).count).toBe(3);
  });

  it("never replaces corrupt existing data with a seed", async () => {
    const { values, create } = harness();
    values.set("commitmentguard:test", "corrupt-data");
    await expect(create().read()).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(values.get("commitmentguard:test")).toBe("corrupt-data");
  });

  it("fails closed on HTTP-200 Redis errors", async () => {
    const { create, fetcher } = harness();
    vi.mocked(fetcher).mockResolvedValueOnce(Response.json({ error: "ERR" }));
    await expect(create().read()).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });

  it("does not claim success for a failed write", async () => {
    const { create, fetcher } = harness();
    const store = create();
    await store.read();
    vi.mocked(fetcher).mockImplementationOnce(async () => Response.json({ result: '{"count":0}' }));
    vi.mocked(fetcher).mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await expect(store.mutate((db) => { db.count++; })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect((await store.read()).count).toBe(0);
  });
});
