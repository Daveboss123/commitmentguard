export type KiteState =
  | "ready"
  | "not_configured"
  | "cli_missing"
  | "unauthenticated"
  | "agent_not_registered"
  | "session_pending_approval"
  | "session_active"
  | "session_expired"
  | "session_exhausted"
  | "execution_pending"
  | "execution_succeeded"
  | "execution_failed"
  | "mock_mode";

export interface KiteStatus {
  mode: "mock" | "cli" | "unavailable";
  executionMode: "simulated" | "live";
  state: KiteState;
  backendReachable: boolean | null;
  cliInstalled: boolean | null;
  cliVersion: string | null;
  loggedIn: boolean | null;
  userEmail: string | null;
  agentRegistered: boolean | null;
  sessionActive: boolean | null;
  note: string;
  checkedAt: string;
  raw: Record<string, unknown> | null;
}

export interface CreateKiteSessionInput {
  taskSummary: string;
  maxTotalUsdc: string;
  maxPerTxUsdc: string;
  ttl: string;
  orderId: string;
}

export interface KiteSessionRequest {
  requestId: string;
  sessionId: string | null;
  approvalUrl: string | null;
  status: KiteState;
  maxTotalUsdc: string;
  maxPerTxUsdc: string;
  expiresAt: string | null;
  simulated: boolean;
  note: string;
  raw: Record<string, unknown> | null;
}

export interface KiteSessionStatus {
  requestId: string;
  status: KiteState;
  active: boolean;
  sessionId: string | null;
  approvalUrl: string | null;
  expiresAt: string | null;
  simulated: boolean;
  note: string;
  raw: Record<string, unknown> | null;
}

export interface KitePaidRequest {
  requestId: string;
  sessionId: string | null;
  url: string;
  method: "POST";
  body: Record<string, unknown>;
  maxAmountUsdc: string;
  idempotencyKey: string;
}

export interface KiteExecutionResult {
  status: "pending" | "succeeded" | "failed";
  externalReference: string | null;
  amountUsdc: string | null;
  providerActivation: "not_integrated" | "unknown";
  simulated: boolean;
  responseSummary: Record<string, unknown> | null;
  errorCode: string | null;
  note: string;
  raw: Record<string, unknown> | null;
}

export interface KiteAdapter {
  readonly mode: KiteStatus["mode"];
  getStatus(): Promise<KiteStatus>;
  createSession(input: CreateKiteSessionInput): Promise<KiteSessionRequest>;
  getSessionStatus(requestId: string): Promise<KiteSessionStatus>;
  executePaidRequest(input: KitePaidRequest): Promise<KiteExecutionResult>;
}
