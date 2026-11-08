import "server-only";
import { randomUUID } from "node:crypto";
import { serverConfig, isKiteLiveEnabled } from "@/lib/app/config";
import type {
  CreateKiteSessionInput,
  KiteAdapter,
  KiteExecutionResult,
  KitePaidRequest,
  KiteSessionRequest,
  KiteSessionStatus,
  KiteStatus,
} from "./types";
import { KiteMockAdapter } from "./mock";
import { KiteCliAdapter } from "./cli";

/**
 * Real CLI session/status lane with simulated payment execution. This is the
 * default when KITE_MODE=cli and KITE_EXECUTION_MODE=simulated.
 */
class KiteCliSimulatedExecutionAdapter implements KiteAdapter {
  readonly mode = "cli" as const;
  private readonly cli = new KiteCliAdapter();

  async getStatus(): Promise<KiteStatus> {
    const status = await this.cli.getStatus();
    return {
      ...status,
      executionMode: "simulated",
      note: `${status.note} Payment execution is simulated; no Kite payment will be attempted.`,
    };
  }

  createSession(input: CreateKiteSessionInput): Promise<KiteSessionRequest> {
    return this.cli.createSession(input);
  }

  getSessionStatus(requestId: string): Promise<KiteSessionStatus> {
    return this.cli.getSessionStatus(requestId);
  }

  async executePaidRequest(
    input: KitePaidRequest,
  ): Promise<KiteExecutionResult> {
    const session = await this.cli.getSessionStatus(input.requestId);
    if (session.status === "session_expired") {
      return {
        status: "failed",
        externalReference: null,
        amountUsdc: null,
        providerActivation: "not_integrated",
        simulated: true,
        responseSummary: null,
        errorCode: "KITE_SESSION_EXPIRED",
        note: "The Kite session expired before execution. No simulated payment was recorded.",
        raw: null,
      };
    }
    if (!session.active) {
      return {
        status: "pending",
        externalReference: null,
        amountUsdc: null,
        providerActivation: "not_integrated",
        simulated: true,
        responseSummary: null,
        errorCode: "KITE_SESSION_PENDING",
        note: "The Kite session has not been approved. No simulated payment was recorded.",
        raw: null,
      };
    }

    return {
      status: "succeeded",
      externalReference: `SIMULATED-EXEC-${randomUUID()}`,
      amountUsdc: input.maxAmountUsdc,
      providerActivation: "not_integrated",
      simulated: true,
      responseSummary: {
        simulated: true,
        realKiteSession: true,
        kiteRequestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
        message:
          "A real Kite session was approved, but payment execution is simulated in this build. No funds moved and no provider contract changed.",
      },
      errorCode: null,
      note: "SIMULATED execution against a real Kite session. Not a Kite transaction; provider activation is not integrated.",
      raw: null,
    };
  }
}

export function getKiteAdapter(): KiteAdapter {
  const mode = serverConfig.kite.mode;
  if (mode === "mock") return new KiteMockAdapter();
  if (mode === "cli" || mode === "live") {
    if (serverConfig.kite.executionMode === "live") {
      return new KiteCliAdapter();
    }
    return new KiteCliSimulatedExecutionAdapter();
  }
  return new KiteMockAdapter();
}

export function isMockKite(): boolean {
  return !isKiteLiveEnabled();
}

export function isKiteExecutionLive(): boolean {
  return (
    isKiteLiveEnabled() &&
    serverConfig.kite.executionMode === "live" &&
    Boolean(serverConfig.kite.checkoutUrl)
  );
}

export { KiteMockAdapter } from "./mock";
export { KiteCliAdapter } from "./cli";
