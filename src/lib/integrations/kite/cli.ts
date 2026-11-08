import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { serverConfig } from "@/lib/app/config";
import { serverNow } from "@/lib/store/database";
import { ApiError } from "@/lib/http/errors";
import type {
  CreateKiteSessionInput,
  KiteAdapter,
  KiteExecutionResult,
  KitePaidRequest,
  KiteSessionRequest,
  KiteSessionStatus,
  KiteStatus,
  KiteState,
} from "./types";

const execFileAsync = promisify(execFile);

interface CliRunResult {
  stdout: string;
  stderr: string;
}

function isMissingCli(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" || code === "EACCES";
}

async function runKpass(args: string[]): Promise<CliRunResult> {
  try {
    const result = await execFileAsync(serverConfig.kite.cliPath, args, {
      timeout: serverConfig.kite.timeoutMs,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
    });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } catch (error) {
    if (isMissingCli(error)) {
      throw new ApiError(
        "KITE_CLI_MISSING",
        "The kpass CLI was not found on the server. Install Kite Passport or use mock mode.",
      );
    }
    const failure = error as { stdout?: string; stderr?: string };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

function parseJsonOutput(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }
}

function deepFind(root: unknown, keys: string[]): unknown {
  const queue: unknown[] = [root];
  const visited = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    const record = current as Record<string, unknown>;
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null) return record[key];
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function kiteStateFrom(raw: Record<string, unknown>): {
  state: KiteState;
  active: boolean;
} {
  const status = String(
    deepFind(raw, ["status", "session_status", "state"]) ?? "",
  ).toLowerCase();
  const activeValue = deepFind(raw, ["active", "is_active"]);
  if (status.includes("expired")) return { state: "session_expired", active: false };
  if (status.includes("exhaust")) return { state: "session_exhausted", active: false };
  if (status.includes("pending")) {
    return { state: "session_pending_approval", active: false };
  }
  if (
    activeValue === true ||
    status.includes("active") ||
    status.includes("approved") ||
    status.includes("authorized")
  ) {
    return { state: "session_active", active: true };
  }
  if (status.includes("success")) return { state: "execution_succeeded", active: false };
  if (status.includes("fail")) return { state: "execution_failed", active: false };
  return { state: "session_pending_approval", active: false };
}

function parseIso(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const VARIANTS = ["session", "agent:session"] as const;

export class KiteCliAdapter implements KiteAdapter {
  readonly mode = "cli" as const;

  private async runSessionCommand(
    command: "create" | "status",
    args: string[],
  ): Promise<Record<string, unknown>> {
    let last: Record<string, unknown> = {};
    for (const variant of VARIANTS) {
      const output = await runKpass([variant, command, ...args, "--output", "json"]);
      const parsed = parseJsonOutput(output.stdout);
      last = parsed;
      const errorText = [
        asString(parsed.error),
        asString(parsed.hint),
        output.stderr,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (
        errorText.includes("unknown command") ||
        errorText.includes("unrecognized") ||
        errorText.includes("not a command")
      ) {
        continue;
      }
      if (asString(parsed.error)) {
        if (errorText.includes("not logged in") || errorText.includes("auth")) {
          throw new ApiError(
            "KITE_AUTH_REQUIRED",
            "Kite Passport is not authenticated on the server. Run kpass login, or use mock mode.",
          );
        }
        throw new ApiError(
          "KITE_EXECUTION_FAILED",
          "The kpass CLI returned an error. No action was taken.",
          { error: asString(parsed.error) },
        );
      }
      return parsed;
    }
    return last;
  }

  async getStatus(): Promise<KiteStatus> {
    let output: CliRunResult;
    try {
      output = await runKpass(["status", "--output", "json"]);
    } catch (error) {
      if (error instanceof ApiError) {
        return {
          mode: "cli",
          executionMode: serverConfig.kite.executionMode === "live" ? "live" : "simulated",
          state: "cli_missing",
          backendReachable: null,
          cliInstalled: false,
          cliVersion: null,
          loggedIn: null,
          userEmail: null,
          agentRegistered: null,
          sessionActive: null,
          note: error.message,
          checkedAt: serverNow(),
          raw: null,
        };
      }
      throw error;
    }

    const raw = parseJsonOutput(output.stdout);
    if (Object.keys(raw).length === 0) {
      return {
        mode: "cli",
        executionMode: serverConfig.kite.executionMode === "live" ? "live" : "simulated",
        state: "not_configured",
        backendReachable: false,
        cliInstalled: true,
        cliVersion: null,
        loggedIn: null,
        userEmail: null,
        agentRegistered: null,
        sessionActive: null,
        note:
          output.stderr.trim() ||
          "The kpass CLI did not return machine-readable status.",
        checkedAt: serverNow(),
        raw: null,
      };
    }

    const user = raw.user as Record<string, unknown> | undefined;
    const agent = raw.agent as Record<string, unknown> | undefined;
    const session = raw.session as Record<string, unknown> | undefined;
    const backend = raw.backend as Record<string, unknown> | undefined;
    const loggedIn = user?.logged_in === true;
    const agentRegistered = agent?.registered === true;
    const backendReachable =
      typeof backend?.reachable === "boolean" ? backend.reachable : null;

    let state: KiteState = "ready";
    let note = "Kite Passport CLI is installed and authenticated.";
    if (backendReachable === false) {
      state = "not_configured";
      note = "The Kite backend is not reachable from this server.";
    } else if (!loggedIn) {
      state = "unauthenticated";
      note =
        asString(raw.hint) ??
        "Kite Passport CLI is installed but not logged in. Mock mode remains available.";
    } else if (!agentRegistered) {
      state = "agent_not_registered";
      note = "A Kite user is logged in but no agent is registered yet.";
    }

    return {
      mode: "cli",
      executionMode: serverConfig.kite.executionMode === "live" ? "live" : "simulated",
      state,
      backendReachable,
      cliInstalled: true,
      cliVersion: null,
      loggedIn,
      userEmail: asString(user?.email),
      agentRegistered,
      sessionActive: session?.active === true,
      note,
      checkedAt: serverNow(),
      raw,
    };
  }

  async createSession(input: CreateKiteSessionInput): Promise<KiteSessionRequest> {
    const raw = await this.runSessionCommand("create", [
      "--task-summary",
      input.taskSummary,
      "--max-amount-per-tx",
      input.maxPerTxUsdc,
      "--max-total-amount",
      input.maxTotalUsdc,
      "--ttl",
      input.ttl,
      "--assets",
      "USDC",
      "--separate",
      "--no-browser",
    ]);

    const requestId =
      asString(deepFind(raw, ["request_id", "requestId", "id"])) ?? randomUUID();
    const approvalUrl = asString(
      deepFind(raw, ["approval_url", "approvalUrl", "url"]),
    );
    const sessionId = asString(
      deepFind(raw, ["session_id", "sessionId", "session_token"]),
    );
    const state = kiteStateFrom(raw);

    return {
      requestId,
      sessionId,
      approvalUrl,
      status: state.state,
      maxTotalUsdc: input.maxTotalUsdc,
      maxPerTxUsdc: input.maxPerTxUsdc,
      expiresAt: parseIso(
        deepFind(raw, ["expires_at", "expiresAt", "expiry", "expires"]),
      ),
      simulated: false,
      note: approvalUrl
        ? "Approve this request with your Kite passkey, then refresh the session status."
        : "Kite did not return an approval URL. Check the CLI output and session status.",
      raw,
    };
  }

  async getSessionStatus(requestId: string): Promise<KiteSessionStatus> {
    const raw = await this.runSessionCommand("status", [
      "--request-id",
      requestId,
    ]);
    const state = kiteStateFrom(raw);
    return {
      requestId,
      status: state.state,
      active: state.active,
      sessionId: asString(deepFind(raw, ["session_id", "sessionId"])),
      approvalUrl: asString(deepFind(raw, ["approval_url", "approvalUrl"])),
      expiresAt: parseIso(
        deepFind(raw, ["expires_at", "expiresAt", "expiry", "expires"]),
      ),
      simulated: false,
      note: state.active
        ? "Kite session is active. Execution remains capped by the approved budget."
        : "Kite session is not active. Execution is refused.",
      raw,
    };
  }

  async executePaidRequest(
    input: KitePaidRequest,
  ): Promise<KiteExecutionResult> {
    if (!serverConfig.kite.checkoutUrl) {
      return {
        status: "failed",
        externalReference: null,
        amountUsdc: null,
        providerActivation: "not_integrated",
        simulated: false,
        responseSummary: null,
        errorCode: "KITE_NOT_CONFIGURED",
        note:
          "No x402 demo checkout URL is configured. No payment was attempted.",
        raw: null,
      };
    }

    let lastRaw: Record<string, unknown> = {};
    for (const variant of VARIANTS) {
      const output = await runKpass([
        variant,
        "execute",
        "--url",
        serverConfig.kite.checkoutUrl,
        "--method",
        "POST",
        "--headers",
        JSON.stringify({ "Content-Type": "application/json" }),
        "--body",
        JSON.stringify(input.body),
        ...(input.sessionId ? ["--session-id", input.sessionId] : []),
        "--idempotency-key",
        input.idempotencyKey,
        "--output",
        "json",
      ]);
      const raw = parseJsonOutput(output.stdout);
      lastRaw = raw;
      const errorText = [
        asString(raw.error),
        asString(raw.hint),
        output.stderr,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (
        errorText.includes("unknown command") ||
        errorText.includes("unrecognized")
      ) {
        continue;
      }
      const explicitError = asString(raw.error);
      const reference = asString(
        deepFind(raw, [
          "tx_hash",
          "transaction_hash",
          "transaction_id",
          "reference",
          "external_reference",
          "payment_id",
        ]),
      );
      const success =
        raw.success === true ||
        String(deepFind(raw, ["status"]) ?? "").toLowerCase().includes("success") ||
        Boolean(reference);

      if (explicitError || !success || !reference) {
        return {
          status: "failed",
          externalReference: null,
          amountUsdc: input.maxAmountUsdc,
          providerActivation: "not_integrated",
          simulated: false,
          responseSummary: { error: explicitError ?? "no traceable reference" },
          errorCode: "KITE_EXECUTION_FAILED",
          note:
            "The kpass CLI did not return a traceable success reference. No success is claimed.",
          raw,
        };
      }

      return {
        status: "succeeded",
        externalReference: reference,
        amountUsdc: input.maxAmountUsdc,
        providerActivation: "not_integrated",
        simulated: false,
        responseSummary: {
          status: deepFind(raw, ["status"]),
          reference,
          providerNote:
            "Kite payment success does not activate the broadband service.",
        },
        errorCode: null,
        note:
          "Kite reported a paid request with a traceable reference. Provider activation is not integrated.",
        raw,
      };
    }

    return {
      status: "failed",
      externalReference: null,
      amountUsdc: input.maxAmountUsdc,
      providerActivation: "not_integrated",
      simulated: false,
      responseSummary: null,
      errorCode: "KITE_EXECUTION_FAILED",
      note: "No supported kpass execute command variant was found. No action was taken.",
      raw: lastRaw,
    };
  }
}
