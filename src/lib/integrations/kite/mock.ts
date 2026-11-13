import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabase, mutateDatabase, serverNow } from "@/lib/store/database";
import type { Database } from "@/lib/domain/types";
import { compareUsdcAmounts } from "@/lib/domain/money";
import type {
  CreateKiteSessionInput,
  KiteAdapter,
  KiteExecutionResult,
  KitePaidRequest,
  KiteSessionRequest,
  KiteSessionStatus,
  KiteStatus,
} from "./types";

type MockSession = NonNullable<Database["simulatedKiteSessions"]>[number];

function statusOf(requestId: string, stored?: MockSession): KiteSessionStatus {
  const expired = !stored || new Date(stored.expiresAt).getTime() <= Date.now();
  const status = expired ? "session_expired" : stored.executed
    ? "execution_succeeded" : stored.approved ? "session_active" : "session_pending_approval";
  return {
    requestId,
    status,
    active: status === "session_active",
    sessionId: stored?.sessionId ?? null,
    approvalUrl: null,
    expiresAt: stored?.expiresAt ?? null,
    simulated: true,
    note: expired ? "Unknown or expired simulated session. Nothing can execute."
      : "Simulated session state only. No Passport authorization or funds movement occurred.",
    raw: null,
  };
}

function ttlToMs(ttl: string): number {
  const match = ttl.match(/^(\d+)(m|h|s)$/i);
  if (!match) return 30 * 60 * 1000;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "m") return value * 60 * 1000;
  return value * 1000;
}

/**
 * Explicit demo simulator. It never contacts Kite, never moves funds and never
 * produces a real transaction reference. Every result is marked simulated.
 */
export class KiteMockAdapter implements KiteAdapter {
  readonly mode = "mock" as const;

  async getStatus(): Promise<KiteStatus> {
    return {
      mode: "mock",
      executionMode: "simulated",
      state: "mock_mode",
      backendReachable: null,
      cliInstalled: null,
      cliVersion: null,
      loggedIn: null,
      userEmail: null,
      agentRegistered: null,
      sessionActive: false,
      note: "Mock Kite mode is active. No Passport session, payment or provider activation is real.",
      checkedAt: serverNow(),
      raw: null,
    };
  }

  async createSession(input: CreateKiteSessionInput): Promise<KiteSessionRequest> {
    const requestId = `kite_mock_req_${randomUUID()}`;
    const expiresAtMs = Date.now() + ttlToMs(input.ttl);
    const request: KiteSessionRequest = {
      requestId,
      sessionId: `kite_mock_session_${randomUUID()}`,
      approvalUrl: null,
      status: "session_pending_approval",
      maxTotalUsdc: input.maxTotalUsdc,
      maxPerTxUsdc: input.maxPerTxUsdc,
      expiresAt: new Date(expiresAtMs).toISOString(),
      simulated: true,
      note: "Simulated Kite session. No Passport approval link exists in mock mode; use the in-app simulator.",
      raw: null,
    };
    await mutateDatabase((database) => {
      database.simulatedKiteSessions ??= [];
      database.simulatedKiteSessions.push({
        requestId,
        sessionId: request.sessionId!,
        maxTotalUsdc: input.maxTotalUsdc,
        maxPerTxUsdc: input.maxPerTxUsdc,
        expiresAt: request.expiresAt!,
        approved: false,
        executed: false,
      });
    });
    return request;
  }

  async getSessionStatus(requestId: string): Promise<KiteSessionStatus> {
    const database = await getDatabase();
    return statusOf(requestId, database.simulatedKiteSessions?.find((item) => item.requestId === requestId));
  }

  async simulateApproval(requestId: string): Promise<KiteSessionStatus> {
    return mutateDatabase((database) => {
      const stored = database.simulatedKiteSessions?.find((item) => item.requestId === requestId);
      if (stored && new Date(stored.expiresAt).getTime() > Date.now() && !stored.executed) {
        stored.approved = true;
      }
      return statusOf(requestId, stored);
    });
  }

  async executePaidRequest(
    input: KitePaidRequest,
  ): Promise<KiteExecutionResult> {
    return mutateDatabase((database) => this.executeSimulated(database, input));
  }

  private executeSimulated(database: Database, input: KitePaidRequest): KiteExecutionResult {
    const stored = database.simulatedKiteSessions?.find((item) => item.requestId === input.requestId);
    if (!stored) {
      return {
        status: "failed",
        externalReference: null,
        amountUsdc: null,
        providerActivation: "not_integrated",
        simulated: true,
        responseSummary: null,
        errorCode: "KITE_SESSION_EXPIRED",
        note: "Unknown simulated session. No action was taken.",
        raw: null,
      };
    }
    if (new Date(stored.expiresAt).getTime() <= Date.now()) {
      return {
        status: "failed",
        externalReference: null,
        amountUsdc: null,
        providerActivation: "not_integrated",
        simulated: true,
        responseSummary: null,
        errorCode: "KITE_SESSION_EXPIRED",
        note: "The simulated session expired. Execution was refused.",
        raw: null,
      };
    }
    if (!stored.approved) {
      return {
        status: "pending",
        externalReference: null,
        amountUsdc: null,
        providerActivation: "not_integrated",
        simulated: true,
        responseSummary: null,
        errorCode: "KITE_SESSION_PENDING",
        note: "The simulated session has not been approved.",
        raw: null,
      };
    }

    if (stored.executed) {
      return {
        status: "failed", externalReference: null, amountUsdc: null,
        providerActivation: "not_integrated", simulated: true, responseSummary: null,
        errorCode: "EXECUTION_ALREADY_SUBMITTED", note: "Duplicate simulated execution refused.", raw: null,
      };
    }
    if (compareUsdcAmounts(input.maxAmountUsdc, "0") <= 0 ||
      compareUsdcAmounts(input.maxAmountUsdc, stored.maxTotalUsdc) > 0 ||
      compareUsdcAmounts(input.maxAmountUsdc, stored.maxPerTxUsdc) > 0) {
      return {
        status: "failed",
        externalReference: null,
        amountUsdc: input.maxAmountUsdc,
        providerActivation: "not_integrated",
        simulated: true,
        responseSummary: null,
        errorCode: "KITE_BUDGET_EXCEEDED",
        note: "The requested amount exceeds the simulated session cap. Execution was refused.",
        raw: null,
      };
    }

    stored.executed = true;
    return {
      status: "succeeded",
      externalReference: `SIMULATED-KITE-${randomUUID()}`,
      amountUsdc: input.maxAmountUsdc,
      providerActivation: "not_integrated",
      simulated: true,
      responseSummary: {
        simulated: true,
        provider: "demo",
        orderId: input.body.orderId ?? null,
        idempotencyKey: input.idempotencyKey,
        message: "Simulated x402 checkout accepted. No funds moved and no provider contract changed.",
      },
      errorCode: null,
      note: "SIMULATED payment success. This is not a Kite transaction and does not prove provider activation.",
      raw: null,
    };
  }
}
