import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, FileText } from "lucide-react";
import {
  Badge,
  DecisionBadge,
  EmptyState,
  Money,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { getPageContext } from "@/lib/page/context";
import { getHouseholdData } from "@/lib/page/data";
import { formatDate, humanize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Analyses",
};

export default async function AnalysesPage() {
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);

  const analyses = data.analyses;
  const blocked = analyses.filter((item) => item.decision === "block").length;
  const review = analyses.filter((item) => item.decision === "review").length;
  const allowed = analyses.filter((item) => item.decision === "allow").length;

  return (
    <div>
      <PageHeader
        eyebrow="Decisions"
        title="Analyses"
        description="Immutable decision records. Each one captures the intent version, offer version, ledger snapshot and evidence it was computed against."
        actions={
          <ButtonLink href="/app/compare">
            <BarChart3 className="size-4" />
            New comparison
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="overflow-hidden">
          <Stat label="All analyses" value={analyses.length} />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat label="Allowed" value={allowed} tone="accent" />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat label="Needs review" value={review} tone="caution" />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat label="Blocked" value={blocked} tone="danger" />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel>
          <PanelHeader
            title="Decision history"
            description="Newest first. A recalculated analysis is a new record; the old one stays readable."
          />
          {analyses.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-4" />}
              title="No analyses yet"
              description="Start with the Morgan household request. SERV will extract the constraints, you confirm them, and the deterministic engine will evaluate each offer."
              action={
                <ButtonLink href="/app/compare" variant="secondary">
                  Start a comparison
                </ButtonLink>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-[12px]">
                <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                  <tr>
                    <th className="px-5 py-3 font-medium">Offer</th>
                    <th className="px-5 py-3 font-medium">Decision</th>
                    <th className="px-5 py-3 text-right font-medium">12-month total</th>
                    <th className="px-5 py-3 text-right font-medium">Saving</th>
                    <th className="px-5 py-3 font-medium">Evidence</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {analyses.map((analysis) => {
                    const offer = data.offers.find(
                      (item) => item.id === analysis.offerId,
                    );
                    const intent = data.intents.find(
                      (item) => item.id === analysis.intentContractId,
                    );
                    const approval = data.approvals.find(
                      (item) => item.analysisId === analysis.id && item.decision === "approve",
                    );
                    const execution = data.executions.find(
                      (item) => item.analysisId === analysis.id,
                    );
                    return (
                      <tr key={analysis.id} className="align-top hover:bg-surface">
                        <td className="px-5 py-3">
                          <div className="font-medium text-ink">
                            {offer?.providerName ?? analysis.offerId}
                          </div>
                          <div className="text-[11px] text-ink-faint">
                            {offer?.planName ?? "Offer"} · v{analysis.offerVersion}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {approval ? <Badge tone="ok">Approved</Badge> : null}
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
                          <DecisionBadge decision={analysis.decision} />
                          <div className="mt-1 text-[10px] text-ink-faint">
                            {analysis.decisionReasons.length} reason
                            {analysis.decisionReasons.length === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Money
                            minor={analysis.totals.proposed12.totalMinor}
                            unknownLabel="Incomplete"
                          />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Money minor={analysis.totals.savings12Minor} />
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-mono-num text-[11px] text-ink-muted">
                            {analysis.evidenceValidation.valid}/
                            {analysis.evidenceValidation.total}
                          </span>
                          {analysis.unknowns.length > 0 ? (
                            <div className="mt-0.5 text-[10px] text-caution">
                              {analysis.unknowns.length} unknown
                              {analysis.unknowns.length === 1 ? "" : "s"}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 text-[11px] text-ink-faint">
                          {formatDate(analysis.createdAt)}
                          {intent ? (
                            <div className="mt-0.5">
                              intent v{intent.version}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/app/analyses/${analysis.id}`}
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
    </div>
  );
}
