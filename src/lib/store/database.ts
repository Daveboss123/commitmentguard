import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Database } from "@/lib/domain/types";
import { buildSeedDatabase } from "@/lib/fixtures/demo";
import { serverConfig } from "@/lib/app/config";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const UPSTASH_KEY = "commitmentguard:database:v1";

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
  if (serverConfig.upstash.url && serverConfig.upstash.token) return "upstash";
  if (serverConfig.demoPersist && !process.env.VERCEL) return "file";
  return "memory";
}

async function readUpstash(): Promise<Database | null> {
  const response = await fetch(
    `${serverConfig.upstash.url}/get/${encodeURIComponent(UPSTASH_KEY)}`,
    {
      headers: { Authorization: `Bearer ${serverConfig.upstash.token}` },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Upstash read failed with status ${response.status}`);
  }
  const body = (await response.json()) as { result?: string | null };
  if (!body.result) return null;
  return JSON.parse(body.result) as Database;
}

async function writeUpstash(database: Database): Promise<void> {
  const response = await fetch(
    `${serverConfig.upstash.url}/set/${encodeURIComponent(UPSTASH_KEY)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverConfig.upstash.token}`,
        "Content-Type": "text/plain",
      },
      body: JSON.stringify(database),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Upstash write failed with status ${response.status}`);
  }
}

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
      if (cache.driver === "upstash") persisted = await readUpstash();
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
        if (cache.driver === "upstash") await writeUpstash(persisted);
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
  return load();
}

/**
 * Applies a mutation to the in-memory database, then persists it. The caller
 * receives the same object it mutated. This is deliberately a single-process
 * repository for the demo; the interface is what would be replaced by SQL.
 */
export async function mutateDatabase<T>(
  mutator: (database: Database) => T | Promise<T>,
): Promise<T> {
  const cache = getCache();
  await load();

  const result = await mutator(cache.database);

  cache.writeQueue = cache.writeQueue.then(async () => {
    try {
      if (cache.driver === "upstash") await writeUpstash(cache.database);
      if (cache.driver === "file") await writeFileStore(cache.database);
    } catch (error) {
      console.error("[commitmentguard] persistence write failed", {
        driver: cache.driver,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  });
  await cache.writeQueue;

  return result;
}

export async function resetDatabase(): Promise<Database> {
  const cache = getCache();
  const seeded = buildSeedDatabase();
  cache.database = seeded;
  cache.loaded = Promise.resolve(seeded);
  await mutateDatabase(() => undefined);
  return seeded;
}

export function getStorageDriver(): DriverKind {
  return getCache().driver;
}

export function serverNow(): string {
  return new Date().toISOString();
}

export { buildSeedDatabase };
