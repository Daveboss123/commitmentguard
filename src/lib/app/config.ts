import "server-only";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const serverConfig = {
  appUrl: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  authSecret:
    process.env.AUTH_SECRET ??
    "commitmentguard-local-demo-secret-2026-change-in-production",
  demoPersist: bool(process.env.DEMO_PERSIST, true),
  serv: {
    enabled: bool(process.env.SERV_ENABLED, true),
    apiKey: process.env.SERV_API_KEY ?? "",
    baseUrl: process.env.SERV_BASE_URL ?? "https://inference-api.openserv.ai/v1",
    model: process.env.SERV_MODEL ?? "gpt-5.4-mini",
    timeoutMs: int(process.env.SERV_TIMEOUT_MS, 45_000),
  },
  kite: {
    mode: (process.env.KITE_MODE ?? "mock").toLowerCase(),
    executionMode: (process.env.KITE_EXECUTION_MODE ?? "simulated").toLowerCase(),
    cliPath: process.env.KITE_CLI_PATH ?? "kpass",
    checkoutUrl: process.env.KITE_DEMO_CHECKOUT_URL ?? "",
    maxTotalUsdc: process.env.KITE_MAX_TOTAL_USDC ?? "0.05",
    maxPerTxUsdc: process.env.KITE_MAX_PER_TX_USDC ?? "0.05",
    sessionTtl: process.env.KITE_SESSION_TTL ?? "30m",
    timeoutMs: int(process.env.KITE_CLI_TIMEOUT_MS, 30_000),
  },
  uploadMaxBytes: int(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
  upstash: {
    url: process.env.UPSTASH_REDIS_REST_URL ?? "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    key: process.env.UPSTASH_REDIS_KEY ?? "commitmentguard:database:v1",
  },
  proxySecret: process.env.PROXY_SECRET ?? "",
} as const;

export function isServConfigured(): boolean {
  return serverConfig.serv.enabled && serverConfig.serv.apiKey.trim().length > 0;
}

export function isKiteLiveEnabled(): boolean {
  return serverConfig.kite.mode === "cli" || serverConfig.kite.mode === "live";
}
