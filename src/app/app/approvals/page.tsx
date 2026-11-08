import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileCheck2, XCircle } from "lucide-react";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { getPageContext } from "@/lib/page/context";
import { getHouseholdData } from "@/lib/page/data";
import { formatDateTime, humanize } from "@/lib/format";
import { serverNow } from "@/lib/app/clock";

export const metadata: Metadata = {
  title: "Approvals",
};

export default async function ApprovalsPage() {
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);

  const now = serverNow();
  const current = data.approvals.filter(
    (approval) =>
      approval.decision === "approve" &&
      new Date(approval.expiresAt).getTime() > now,
  );
  const rejected = data.approvals.filter(
    (approval) =>
      approval.decision === "reject" ||
      approval.decision === "request_changes",
  );
  const expired = data.approvals.filter(
    (approval) =>
      approval.decision === "approve" &&
      new Date(approval.expiresAt).getTime() <= now,
  );

  return (
    <div>
      <PageHeader
        eyebrow="Consent ledger"
        title="Approvals"
        description="Every consent decision, bound to an analysis hash and an offer version. A 24-hour approval is a limited permission, not a permanent one."
        actions={
          <ButtonLink href="/app/analyses" variant="secondary">
            <FileCheck2 className="size-4" />
            All analyses
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="overflow-hidden">
          <Stat
            label="Current approvals"
            value={current.length}
            detail="Within the 24-hour window"
            tone="accent"
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat label="Rejected or changes" value={rejected.length} />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Expired"
            value={expired.length}
            detail="Not executable"
            tone={expired.length > 0 ? "caution" : "default"}
          />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel>
          <PanelHeader
            title="Decision history"
            description="Newest first. An approval never changes a past analysis; a new decision is a new record."
          />
          {data.approvals.length === 0 ? (
            <EmptyState
              icon={<FileCheck2 className="size-4" />}
              title="No consent has been recorded"
              description="Open an allowed analysis and review its material consequences. Approval creates the record that a capped Kite session depends on."
              action={
                <ButtonLink href="/app/analyses" variant="secondary">
                  Choose an analysis
                </ButtonLink>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[12px]">
                <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                  <tr>
                    <th className="px-5 py-3 font-medium">Offer</th>
                    <th className="px-5 py-3 font-medium">Decision</th>
                    <th className="px-5 py-3 font-medium">Consequences</th>
                    <th className="px-5 py-3 font-medium">Expires</th>
                    <th className="px-5 py-3 font-medium">Recorded</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.approvals.map((approval) => {
                    const analysis = data.analyses.find(
                      (item) => item.id === approval.analysisId,
                    );
                    const offer = analysis
                      ? data.offers.find((item) => item.id === analysis.offerId)
                      : null;
                    const expired =
                      new Date(approval.expiresAt).getTime() <= now;
                    const execution = data.executions.find(
                      (item) => item.approvalId === approval.id,
                    );
                    return (
                      <tr key={approval.id} className="align-top hover:bg-surface">
                        <td className="px-5 py-3">
                          <div className="font-medium text-ink">
                            {offer?.providerName ?? "Offer"}
                          </div>
                          <div className="text-[11px] text-ink-faint">
                            {offer?.planName ?? approval.analysisId}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {execution ? (
                              <Badge
                                tone={
                                  execution.status === "succeeded"
                                    ? "ok"
                                    : execution.status === "failed"
                                      ? "danger"
                                      : "info"
                                }
                              >
                                {humanize(execution.status)}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            tone={
                              approval.decision === "approve"
                                ? expired
                                  ? "caution"
                                  : "ok"
                                : approval.decision === "reject"
                                  ? "danger"
                                  : "caution"
                            }
                          >
                            {approval.decision === "approve" && expired ? (
                              <XCircle className="size-3" />
                            ) : approval.decision === "approve" ? (
                              <CheckCircle2 className="size-3" />
                            ) : null}
                            {humanize(approval.decision)}
                          </Badge>
                          <div className="mt-1 text-[10px] text-ink-faint">
                            {humanize(approval.approverRole)}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono-num text-[11px] text-ink-muted">
                          {approval.acknowledgedConsequences.length}
                        </td>
                        <td className="px-5 py-3 text-[11px]">
                          <span className={expired ? "text-danger" : "text-ink"}>
                            {formatDateTime(approval.expiresAt)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[11px] text-ink-faint">
                          {formatDateTime(approval.createdAt)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/app/approvals/${approval.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
                          >
                            Open
                            <ArrowRight className="size-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-3">
        <p className="text-[11px] leading-5 text-ink-muted">
          Approval does not move money. A Kite session is requested separately with
          explicit USDC caps, and the service re-verifies the approval hash, offer
          version and expiry before any execution.
        </p>
      </div>
    </div>
  );
}
