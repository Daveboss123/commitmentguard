import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/store/database";
import {
  getBenefits,
  getCommitments,
  getDependencies,
  getPolicy,
  listAnalyses,
  listAuditEvents,
  listDocuments,
  listIntents,
  listOffers,
  listReceipts,
  requireHouseholdAccess,
} from "@/lib/store/repository";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

/**
 * Full household data export. Receipts and audit events are included so the
 * household can independently verify the chain; secrets and session data are not.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const access = await requireHouseholdAccess(id);
    const database = await getDatabase();
    const [
      commitments,
      benefits,
      dependencies,
      policy,
      intents,
      offers,
      documents,
      analyses,
      receipts,
      auditEvents,
    ] = await Promise.all([
      getCommitments(id),
      getBenefits(id),
      getDependencies(id),
      getPolicy(id),
      listIntents(id),
      listOffers(id),
      listDocuments(id),
      listAnalyses(id),
      listReceipts(id),
      listAuditEvents(id, 200),
    ]);

    return jsonResponse(
      {
        exportedAt: new Date().toISOString(),
        household: access.household,
        member: access.member,
        policy,
        commitments,
        benefits,
        dependencies,
        intents,
        offers,
        documents,
        evidence: database.evidence.filter((item) =>
          documents.some((document) => document.id === item.documentId) ||
          commitments.some((commitment) => commitment.evidenceIds.includes(item.id)) ||
          benefits.some((benefit) => benefit.evidenceId === item.id) ||
          analyses.some((analysis) => analysis.evidenceIds.includes(item.id)),
        ),
        analyses,
        approvals: database.approvals.filter((approval) =>
          analyses.some((analysis) => analysis.id === approval.analysisId),
        ),
        executions: database.executions.filter((execution) =>
          analyses.some((analysis) => analysis.id === execution.analysisId),
        ),
        receipts,
        auditEvents,
      },
      200,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
