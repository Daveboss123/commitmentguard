import "server-only";
import { randomUUID } from "node:crypto";
import type {
  Analysis,
  Approval,
  AuditEvent,
  Commitment,
  CommitmentBenefit,
  CommitmentDependency,
  Database,
  DecisionReceipt,
  DemoDocument,
  Execution,
  Household,
  HouseholdMember,
  IntentContract,
  Offer,
  UserPolicy,
} from "@/lib/domain/types";
import { getDatabase, mutateDatabase, serverNow } from "@/lib/store/database";
import { requireSession, type DemoSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/http/errors";

export interface HouseholdAccess {
  session: DemoSession;
  household: Household;
  member: HouseholdMember;
}

export async function requireHouseholdAccess(
  householdId: string,
  allowedRoles: Array<HouseholdMember["role"]> = ["owner", "approver", "viewer"],
): Promise<HouseholdAccess> {
  const session = await requireSession();
  const database = await getDatabase();
  const household = database.households.find((item) => item.id === householdId);
  if (!household) {
    throw new ApiError("NOT_FOUND", "Household not found.");
  }
  const member = database.members.find(
    (item) =>
      item.householdId === householdId &&
      item.userId === session.userId &&
      item.status === "active",
  );
  if (!member) {
    throw new ApiError(
      "HOUSEHOLD_ACCESS_DENIED",
      "You do not have access to this household.",
    );
  }
  if (!allowedRoles.includes(member.role)) {
    throw new ApiError(
      "HOUSEHOLD_ACCESS_DENIED",
      "Your household role does not permit this action.",
    );
  }
  return { session, household, member };
}

export async function requireWritableHousehold(
  householdId: string,
): Promise<HouseholdAccess> {
  return requireHouseholdAccess(householdId, ["owner", "approver"]);
}

export async function getMemberForSession(
  session: DemoSession,
): Promise<HouseholdMember | null> {
  const database = await getDatabase();
  return (
    database.members.find(
      (member) =>
        member.householdId === session.householdId &&
        member.userId === session.userId &&
        member.status === "active",
    ) ?? null
  );
}

export async function listVisibleHouseholds(): Promise<Household[]> {
  const session = await requireSession();
  const database = await getDatabase();
  const ids = new Set(
    database.members
      .filter((member) => member.userId === session.userId && member.status === "active")
      .map((member) => member.householdId),
  );
  return database.households.filter((household) => ids.has(household.id));
}

export async function getHousehold(householdId: string): Promise<Household | null> {
  return (await getDatabase()).households.find((item) => item.id === householdId) ?? null;
}

export async function getCommitments(householdId: string): Promise<Commitment[]> {
  return (await getDatabase()).commitments.filter(
    (item) => item.householdId === householdId,
  );
}

export async function getCommitment(commitmentId: string): Promise<Commitment | null> {
  return (
    (await getDatabase()).commitments.find((item) => item.id === commitmentId) ??
    null
  );
}

export async function getBenefits(householdId: string): Promise<CommitmentBenefit[]> {
  return (await getDatabase()).benefits.filter(
    (item) => item.householdId === householdId,
  );
}

export async function getDependencies(
  householdId: string,
): Promise<CommitmentDependency[]> {
  return (await getDatabase()).dependencies.filter(
    (item) => item.householdId === householdId,
  );
}

export async function getPolicy(householdId: string): Promise<UserPolicy | null> {
  const policies = (await getDatabase()).policies
    .filter((item) => item.householdId === householdId)
    .sort((left, right) => right.version - left.version);
  return policies[0] ?? null;
}

export async function listIntents(householdId: string): Promise<IntentContract[]> {
  return (await getDatabase()).intents
    .filter((item) => item.householdId === householdId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getIntent(intentId: string): Promise<IntentContract | null> {
  return (await getDatabase()).intents.find((item) => item.id === intentId) ?? null;
}

export async function listOffers(householdId: string): Promise<Offer[]> {
  return (await getDatabase()).offers.filter(
    (item) => item.householdId === householdId,
  );
}

export async function getOffer(offerId: string): Promise<Offer | null> {
  return (await getDatabase()).offers.find((item) => item.id === offerId) ?? null;
}

export async function listDocuments(householdId: string): Promise<DemoDocument[]> {
  return (await getDatabase()).documents.filter(
    (item) => item.householdId === householdId,
  );
}

export async function getDocument(documentId: string): Promise<DemoDocument | null> {
  return (await getDatabase()).documents.find((item) => item.id === documentId) ?? null;
}

export async function listAnalyses(householdId: string): Promise<Analysis[]> {
  return (await getDatabase()).analyses
    .filter((item) => item.householdId === householdId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getAnalysis(analysisId: string): Promise<Analysis | null> {
  return (await getDatabase()).analyses.find((item) => item.id === analysisId) ?? null;
}

export async function getApproval(approvalId: string): Promise<Approval | null> {
  return (await getDatabase()).approvals.find((item) => item.id === approvalId) ?? null;
}

export async function getExecution(executionId: string): Promise<Execution | null> {
  return (await getDatabase()).executions.find((item) => item.id === executionId) ?? null;
}

export async function listExecutions(householdId: string): Promise<Execution[]> {
  const database = await getDatabase();
  const analysisIds = new Set(
    database.analyses
      .filter((analysis) => analysis.householdId === householdId)
      .map((analysis) => analysis.id),
  );
  return database.executions
    .filter((execution) => analysisIds.has(execution.analysisId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getReceipt(receiptId: string): Promise<DecisionReceipt | null> {
  return (await getDatabase()).receipts.find((item) => item.id === receiptId) ?? null;
}

export async function listReceipts(householdId: string): Promise<DecisionReceipt[]> {
  return (await getDatabase()).receipts
    .filter((item) => item.householdId === householdId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listAuditEvents(
  householdId: string,
  limit = 30,
): Promise<AuditEvent[]> {
  return (await getDatabase()).auditEvents
    .filter((item) => item.householdId === householdId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export function makeAuditEvent(input: {
  householdId: string;
  actorType: AuditEvent["actorType"];
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): AuditEvent {
  return {
    id: `audit_${randomUUID()}`,
    householdId: input.householdId,
    actorType: input.actorType,
    actorId: input.actorId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
    createdAt: serverNow(),
  };
}

export function appendAudit(
  database: Database,
  input: Parameters<typeof makeAuditEvent>[0],
): AuditEvent {
  const event = makeAuditEvent(input);
  database.auditEvents.push(event);
  return event;
}

export async function audit(input: Parameters<typeof makeAuditEvent>[0]): Promise<void> {
  await mutateDatabase((database) => {
    appendAudit(database, input);
  });
}

export async function resolveHouseholdForAnalysis(
  analysisId: string,
): Promise<{ analysis: Analysis; householdId: string }> {
  const analysis = await getAnalysis(analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  return { analysis, householdId: analysis.householdId };
}

export async function resolveHouseholdForOffer(
  offerId: string,
): Promise<{ offer: Offer; householdId: string }> {
  const offer = await getOffer(offerId);
  if (!offer) throw new ApiError("NOT_FOUND", "Offer not found.");
  return { offer, householdId: offer.householdId };
}

export async function resolveHouseholdForApproval(
  approvalId: string,
): Promise<{ approval: Approval; analysis: Analysis; householdId: string }> {
  const approval = await getApproval(approvalId);
  if (!approval) throw new ApiError("NOT_FOUND", "Approval not found.");
  const analysis = await getAnalysis(approval.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  return { approval, analysis, householdId: analysis.householdId };
}

export async function resolveHouseholdForExecution(
  executionId: string,
): Promise<{ execution: Execution; analysis: Analysis; householdId: string }> {
  const execution = await getExecution(executionId);
  if (!execution) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
  const analysis = await getAnalysis(execution.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  return { execution, analysis, householdId: analysis.householdId };
}

export async function resolveHouseholdForReceipt(
  receiptId: string,
): Promise<{ receipt: DecisionReceipt; householdId: string }> {
  const receipt = await getReceipt(receiptId);
  if (!receipt) throw new ApiError("NOT_FOUND", "Receipt not found.");
  return { receipt, householdId: receipt.householdId };
}
