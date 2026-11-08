import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleAlert,
  FileText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  DecisionBadge,
  InlineNotice,
  KeyValue,
  Money,
  PageHeader,
  Panel,
  PanelHeader,
} from "@/components/ui";
import { ConsentForm } from "@/components/consent-form";
import { getPageContext } from "@/lib/page/context";
import { getAnalysisBundle, assertAnalysisCurrent } from "@/lib/services/analysis.service";
import { humanize } from "@/lib/format";
import { serverNow } from "@/lib/app/clock";

export const metadata: Metadata = {
  title: "Consent review",
};

export default async function ConsentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { household, member } = await getPageContext();
  const bundle = await getAnalysisBundle(id);
  if (bundle.analysis.householdId !== household.id) notFound();

  const { analysis, intent, offer } = bundle;
  if (!offer) notFound();

  let staleReason: string | null = null;
  try {
    await assertAnalysisCurrent(analysis);
  } catch (error) {
    staleReason =
      error instanceof Error
        ? error.message
        : "The analysis is no longer current. Re-run it before approval.";
  }

  const canRecord =
    member?.role === "owner" ||
    member?.role === "approver";
  const approverRole = member?.role === "approver" ? "approver" : "owner";

  const existingApproval =
    bundle.approvals
      .filter(
        (item) =>
          item.decision === "approve" &&
          item.analysisHash === analysis.inputHash &&
          new Date(item.expiresAt).getTime() > serverNow(),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
    null;

  const approveBlockedReason =
    staleReason ??
    (analysis.decision !== "allow"
      ? analysis.decision === "review"
        ? "The engine returned Review, not Allow. Resolve the unknown or incomplete terms before consent."
        : "The engine returned Block. A hard-constraint failure cannot be approved away."
      : analysis.unknowns.length > 0
        ? "Material terms remain unknown. Approval is refused until they are resolved."
        : analysis.evidenceValidation.invalidEvidenceIds.length > 0 ||
            analysis.evidenceValidation.contradictedEvidenceIds.length > 0
          ? "One or more evidence quotes are invalid or contradicted. Approval is refused."
          : existingApproval
            ? "A current approval already exists for this analysis. Open it to request a Kite session."
            : !canRecord
              ? "This member has read-only access to the household."
              : null);

  const materialConsequences = analysis.consequences
    .filter(
      (item) => item.severity === "critical" || item.severity === "high",
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      severity: item.severity,
      category: item.category,
      direction: item.direction,
    }));

  const otherConsequences = analysis.consequences.filter(
    (item) => item.severity !== "critical" && item.severity !== "high",
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px] text-ink-muted">
        <Link
          href={`/app/analyses/${analysis.id}`}
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Back to consequence analysis
        </Link>
        <Link
          href={`/app/compare/${analysis.intentContractId}`}
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          Compare offers
        </Link>
      </div>

      <PageHeader
        eyebrow="Consent review · required before payment"
        title="Approve the consequence, not the headline price."
        description={`${offer.providerName} — ${offer.planName} · offer v${offer.offerVersion}. Read the material effects, tick each one, and record a decision.`}
        actions={<DecisionBadge decision={analysis.decision} size="large" />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="overflow-hidden">
          <div className="px-5 py-4">
            <div className="text-[11px] text-ink-faint">Proposed, 12 months</div>
            <div className="mt-1.5 font-display text-[24px] leading-none text-ink">
              <Money
                minor={analysis.totals.proposed12.totalMinor}
                unknownLabel="Incomplete"
              />
            </div>
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <div className="px-5 py-4">
            <div className="text-[11px] text-ink-faint">Difference, 12 months</div>
            <div className="mt-1.5 font-display text-[24px] leading-none">
              <Money
                minor={
                  analysis.totals.delta12Minor === null
                    ? null
                    : Math.abs(analysis.totals.delta12Minor)
                }
                unknownLabel="Incomplete"
                className={
                  analysis.totals.delta12Minor !== null &&
                  analysis.totals.delta12Minor > 0
                    ? "text-danger"
                    : "text-ok"
                }
              />
            </div>
            <div className="mt-1 text-[10px] text-ink-faint">
              {analysis.totals.delta12Minor === null
                ? "Not computable"
                : analysis.totals.delta12Minor > 0
                  ? "More than the current baseline"
                  : "Less than the current baseline"}
            </div>
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <div className="px-5 py-4">
            <div className="text-[11px] text-ink-faint">Material consequences</div>
            <div className="mt-1.5 font-display text-[24px] leading-none text-ink">
              {materialConsequences.length}
            </div>
            <div className="mt-1 text-[10px] text-ink-faint">
              high or critical severity
            </div>
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <div className="px-5 py-4">
            <div className="text-[11px] text-ink-faint">Evidence validity</div>
            <div className="mt-1.5 font-display text-[24px] leading-none text-ink">
              {analysis.evidenceValidation.valid}/
              {analysis.evidenceValidation.total}
            </div>
            <div className="mt-1 text-[10px] text-ink-faint">
              quotes located in the source
            </div>
          </div>
        </Panel>
      </div>

      {existingApproval ? (
        <div className="mb-6">
          <InlineNotice tone="ok" title="A current approval already exists">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                This analysis was already approved and the approval is still
                within its 24-hour window.
              </span>
              <Link
                href={`/app/approvals/${existingApproval.id}`}
                className="font-medium underline underline-offset-2"
              >
                Open the approval record
              </Link>
            </div>
          </InlineNotice>
        </div>
      ) : null}

      {analysis.decision === "review" ? (
        <div className="mb-6">
          <InlineNotice tone="caution" title="Review, not consent">
            The engine cannot clear this offer yet. Resolve the unknowns below, or
            choose an offer whose terms can be fully priced. Request changes or
            reject are still recorded as decisions.
          </InlineNotice>
        </div>
      ) : null}

      {analysis.decision === "block" ? (
        <div className="mb-6">
          <InlineNotice tone="danger" title="Blocked at the engine">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                A hard constraint or an evidence failure produced this decision.
                Approval is refused by the service, not just hidden in the UI.
              </span>
            </div>
          </InlineNotice>
        </div>
      ) : null}

      <ConsentForm
        analysisId={analysis.id}
        offerVersion={analysis.offerVersion}
        currency={intent?.currency ?? "USD"}
        proposed12Minor={analysis.totals.proposed12.totalMinor}
        consequences={materialConsequences}
        approveBlockedReason={approveBlockedReason}
        canRecord={canRecord}
        approverRole={approverRole}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="The exact analysis"
            description="The approval is bound to this input hash. Changing the ledger or the offer invalidates it."
          />
          <div className="px-5 py-2">
            <dl>
              <KeyValue label="Analysis">
                <span className="font-mono-num text-[10px]">{analysis.id}</span>
              </KeyValue>
              <KeyValue label="Input hash">
                <span className="font-mono-num text-[10px]">
                  {analysis.inputHash.slice(0, 24)}…
                </span>
              </KeyValue>
              <KeyValue label="Offer version">
                <span className="font-mono-num">v{analysis.offerVersion}</span>
              </KeyValue>
              <KeyValue label="Intent version">
                <span className="font-mono-num">v{analysis.intentVersion}</span>
              </KeyValue>
              <KeyValue label="Unknowns">
                {analysis.unknowns.length === 0 ? (
                  <Badge tone="ok">None material</Badge>
                ) : (
                  <Badge tone="caution">
                    {analysis.unknowns.length} unresolved
                  </Badge>
                )}
              </KeyValue>
            </dl>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Also recorded"
            description="Lower-severity consequences are part of the record even though they are not acknowledgement gates."
            action={
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
                <FileText className="size-3.5" />
                {otherConsequences.length}
              </span>
            }
          />
          {otherConsequences.length === 0 ? (
            <p className="px-5 py-4 text-[12px] text-ink-muted">
              No additional consequence was recorded.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {otherConsequences.slice(0, 6).map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-ink">
                      {item.title}
                    </span>
                    <Badge tone="neutral">{humanize(item.direction)}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-ink-muted">
                    {item.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line px-5 py-3">
            <Link
              href={`/app/analyses/${analysis.id}`}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-strong"
            >
              <ShieldCheck className="size-3.5" />
              Review every consequence and evidence quote
            </Link>
          </div>
        </Panel>
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-caution" />
        <p className="text-[11px] leading-5 text-ink-muted">
          This page records consent only. A Kite session is a separate, capped
          request on the approval page. Provider activation is never claimed.
        </p>
      </div>
    </div>
  );
}
