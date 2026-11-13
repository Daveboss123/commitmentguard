import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "@/lib/domain/types";
import { buildSeedDatabase } from "@/lib/fixtures/demo";
import { serverConfig } from "@/lib/app/config";
import { createRedisSnapshotStore } from "./redis-snapshot";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

type DriverKind = "file" | "memory" | "upstash";

interface StoreCache {
  database: Database;
  driver: DriverKind;
  loaded: Promise<Database> | null;
  writeQueue: Promise<void>;
}

const globalStore = globalThis as typeof globalThis & {
  __commitmentGuardStore?: StoreCache;
};

function chooseDriver(): DriverKind {
  if (Boolean(serverConfig.upstash.url) !== Boolean(serverConfig.upstash.token)) {
    throw new Error("Shared storage requires both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  }
  if (serverConfig.upstash.url && serverConfig.upstash.token) return "upstash";
  if (serverConfig.demoPersist && !process.env.VERCEL) return "file";
  return "memory";
}

const sharedStore = createRedisSnapshotStore<Database>({
  ...serverConfig.upstash,
  seed: buildSeedDatabase,
  validate: (value): value is Database => {
    if (!value || typeof value !== "object" || !("meta" in value)) return false;
    const candidate = value as Database;
    return candidate.meta?.schemaVersion === 1 &&
      ["households", "members", "policies", "commitments", "benefits",
        "dependencies", "documents", "evidence", "intents", "offers", "analyses",
        "approvals", "executions", "receipts", "auditEvents"]
        .every((key) => Array.isArray(candidate[key as keyof Database]));
  },
});

async function readFileStore(): Promise<Database | null> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as Database;
  } catch {
    return null;
  }
}

async function writeFileStore(database: Database): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(database, null, 2), "utf8");
  await rename(temporary, DATA_FILE);
}

function getCache(): StoreCache {
  if (!globalStore.__commitmentGuardStore) {
    const driver = chooseDriver();
    globalStore.__commitmentGuardStore = {
      database: buildSeedDatabase(),
      driver,
      loaded: null,
      writeQueue: Promise.resolve(),
    };
  }
  return globalStore.__commitmentGuardStore;
}

async function load(): Promise<Database> {
  const cache = getCache();
  if (cache.loaded) return cache.loaded;

  cache.loaded = (async () => {
    let persisted: Database | null = null;
    try {
      if (cache.driver === "file") persisted = await readFileStore();
    } catch (error) {
      console.error("[commitmentguard] persistence read failed; using seed", {
        driver: cache.driver,
        message: error instanceof Error ? error.message : "unknown",
      });
    }

    if (!persisted || !persisted.meta || persisted.meta.schemaVersion !== 1) {
      persisted = buildSeedDatabase();
      try {
        if (cache.driver === "file") await writeFileStore(persisted);
      } catch (error) {
        console.error("[commitmentguard] seed persist failed", {
          driver: cache.driver,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    cache.database = persisted;
    return persisted;
  })();

  return cache.loaded;
}

export async function getDatabase(): Promise<Database> {
  // Every Redis read is fresh. A process-global snapshot would make other
  // serverless instances' confirmed writes invisible.
  if (getCache().driver === "upstash") return sharedStore.read();
  await load();
  return getCache().database;
}

/**
 * Mutators may only edit the supplied database. Shared-store CAS conflicts
 * replay them on a fresh snapshot; no external service calls belong inside.
 */
export async function mutateDatabase<T>(
  mutator: (database: Database) => T | Promise<T>,
): Promise<T> {
  const cache = getCache();
  const task = cache.writeQueue.then(async () => {
    if (cache.driver === "upstash") return sharedStore.mutate(mutator);
    await load();
    const draft = structuredClone(cache.database);
    const result = await mutator(draft);
    if (cache.driver === "file") await writeFileStore(draft);
    cache.database = draft;
    return result;
  });
  cache.writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

export async function resetDatabase(): Promise<Database> {
  const seeded = buildSeedDatabase();
  return mutateDatabase((database) => {
    Object.assign(database, seeded, { simulatedKiteSessions: [] });
    return database;
  });
}

export function getStorageDriver(): DriverKind {
  return getCache().driver;
}

export function serverNow(): string {
  return new Date().toISOString();
}

export { buildSeedDatabase };
