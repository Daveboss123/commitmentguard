import "server-only";
import { randomUUID } from "node:crypto";
import { serverNow } from "@/lib/store/database";
import type {
  CreateKiteSessionInput,
  KiteAdapter,
  KiteExecutionResult,
  KitePaidRequest,
  KiteSessionRequest,
  KiteSessionStatus,
  KiteStatus,
} from "./types";

interface MockSession {
  request: KiteSessionRequest;
  approved: boolean;
  executed: boolean;
  expiresAtMs: number;
}

const globalMock = globalThis as typeof globalThis & {
  __commitmentGuardMockKite?: Map<string, MockSession>;
};

function sessions(): Map<string, MockSession> {
  if (!globalMock.__commitmentGuardMockKite) {
    globalMock.__commitmentGuardMockKite = new Map();
  }
  return globalMock.__commitmentGuardMockKite;
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
    sessions().set(requestId, {
      request,
      approved: false,
      executed: false,
      expiresAtMs,
    });
    return request;
  }

  async getSessionStatus(requestId: string): Promise<KiteSessionStatus> {
    const stored = sessions().get(requestId);
    if (!stored) {
      return {
        requestId,
        status: "session_expired",
        active: false,
        sessionId: null,
        approvalUrl: null,
        expiresAt: null,
        simulated: true,
        note: "Unknown simulated session. It cannot be executed.",
        raw: null,
      };
    }
    const expired = stored.expiresAtMs < Date.now();
    const status = expired
      ? "session_expired"
      : stored.executed
        ? "execution_succeeded"
        : stored.approved
          ? "session_active"
          : "session_pending_approval";
    return {
      requestId,
      status,
      active: status === "session_active",
      sessionId: stored.request.sessionId,
      approvalUrl: null,
      expiresAt: stored.request.expiresAt,
      simulated: true,
      note: expired
        ? "Simulated session expired. Execution is refused."
        : stored.approved
          ? "Simulated approval recorded. Execution is allowed while the session is active."
          : "Awaiting simulated approval inside CommitmentGuard.",
      raw: null,
    };
  }

  simulateApproval(requestId: string): KiteSessionStatus {
    const stored = sessions().get(requestId);
    if (stored && stored.expiresAtMs >= Date.now()) {
      stored.approved = true;
    }
    return {
      requestId,
      status: !stored
        ? "session_expired"
        : stored.expiresAtMs < Date.now()
          ? "session_expired"
          : "session_active",
      active: Boolean(stored && stored.expiresAtMs >= Date.now()),
      sessionId: stored?.request.sessionId ?? null,
      approvalUrl: null,
      expiresAt: stored?.request.expiresAt ?? null,
      simulated: true,
      note: "Simulated Passport approval recorded. No real authorization occurred.",
      raw: null,
    };
  }

  async executePaidRequest(
    input: KitePaidRequest,
  ): Promise<KiteExecutionResult> {
    const stored = sessions().get(input.requestId);
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
    if (stored.expiresAtMs < Date.now()) {
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

    const amount = Number.parseFloat(input.maxAmountUsdc);
    const cap = Number.parseFloat(stored.request.maxTotalUsdc);
    if (!Number.isFinite(amount) || amount <= 0 || amount > cap) {
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
