import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  GitCompareArrows,
  Info,
  LockKeyhole,
  ReceiptText,
  Repeat2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  DecisionBadge,
  InlineNotice,
  KeyValue,
  Money,
  MoneyDelta,
  PageHeader,
  Panel,
  PanelHeader,
  SeverityBadge,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { CostBreakdown } from "@/components/cost-breakdown";
import { EvidenceExplorer } from "@/components/evidence-explorer";
import { ReasoningTracePanel } from "@/components/reasoning-trace";
import { ScenarioSandbox } from "@/components/scenario-sandbox";
import { buildReasoningTrace } from "@/lib/domain/trace";
import { toScenarioOutcome } from "@/lib/services/analysis.service";
import {
  ExplainAnalysisButton,
  RecalculateAnalysisButton,
} from "@/components/analysis-actions";
import { getPageContext } from "@/lib/page/context";
import { getHouseholdData } from "@/lib/page/data";
import { getAnalysisBundle } from "@/lib/services/analysis.service";
import { validateEvidence } from "@/lib/domain/evidence";
import type { Consequence } from "@/lib/domain/types";
import { serverNow } from "@/lib/app/clock";
import {
  formatDate,
  formatDateTime,
  formatPercent,
  humanize,
  serviceLabel,
} from "@/lib/format";

export const metadata: Metadata = {
  title: "Consequence analysis",
};

function consequenceList(
  consequences: Consequence[],
  category: Consequence["category"],
) {
  return consequences.filter((item) => item.category === category);
}

function ConsequenceItems({ items }: { items: Consequence[] }) {
  if (items.length === 0) {
    return (
      <p className="px-5 py-4 text-[12px] text-ink-muted">
        No consequence in this category was recorded.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-[13px] font-medium leading-5 text-ink">
              {item.title}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  item.direction === "gain"
                    ? "ok"
                    : item.direction === "loss"
                      ? "danger"
                      : item.direction === "unknown"
                        ? "caution"
                        : "neutral"
                }
              >
                {humanize(item.direction)}
              </Badge>
              <SeverityBadge severity={item.severity} />
            </div>
          </div>
          <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">
            {item.description}
          </p>
          {item.evidenceIds.length > 0 ? (
            <div className="mt-2 text-[10px] text-ink-faint">
              Evidence: {item.evidenceIds.length} reference
              {item.evidenceIds.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { household } = await getPageContext();
  const bundle = await getAnalysisBundle(id);
  const data = await getHouseholdData(household.id);
  if (bundle.analysis.householdId !== household.id) notFound();

  const { analysis, intent, offer } = bundle;
  if (!offer) notFound();

  const approvals = [...bundle.approvals].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const latestApproval = approvals[0] ?? null;
  const execution = [...bundle.executions].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )[0] ?? null;

  const approvalIsCurrent =
    latestApproval?.decision === "approve" &&
    new Date(latestApproval.expiresAt).getTime() > serverNow() &&
    latestApproval.analysisHash === analysis.inputHash &&
    latestApproval.offerVersion === analysis.offerVersion;

  const evidence = data.evidence.filter((item) =>
    analysis.evidenceIds.includes(item.id),
  );
  const sourceTexts = Object.fromEntries(
    data.documents.map((document) => [document.id, document.text]),
  );
  const validation = validateEvidence(evidence, sourceTexts);

  const financial = consequenceList(analysis.consequences, "financial");
  const contractual = consequenceList(analysis.consequences, "contractual");
  const householdImpact = consequenceList(analysis.consequences, "household_benefit");
  const reversibility = consequenceList(analysis.consequences, "reversibility");
  const service = consequenceList(analysis.consequences, "service");
  const dataConsequences = consequenceList(analysis.consequences, "data");
  const dependencies = data.dependencies.filter(
    (dependency) =>
      dependency.fromCommitmentId === offer.id ||
      dependency.toCommitmentId === offer.id ||
      data.commitments.some((commitment) =>
        commitment.evidenceIds.some((evidenceId) =>
          analysis.evidenceIds.includes(evidenceId),
        ),
      ),
  );

  const consentHref = approvalIsCurrent
    ? `/app/approvals/${latestApproval.id}`
    : `/app/analyses/${analysis.id}/consent`;
  const reasoningTrace = buildReasoningTrace({
    analysis,
    intent,
    offer,
    commitmentsCount: data.commitments.filter((item) => item.status === "active")
      .length,
    benefitsCount: data.benefits.length,
    dependenciesCount: data.dependencies.length,
    documentsCount: data.documents.length,
  });
  const decisionTone =
    analysis.decision === "allow"
      ? "border-ok/30 bg-ok-soft"
      : analysis.decision === "review"
        ? "border-caution/30 bg-caution-soft"
        : "border-danger/30 bg-danger-soft";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px] text-ink-muted">
        <Link
          href="/app/analyses"
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          <ArrowRight className="size-3.5 rotate-180" />
          All analyses
        </Link>
        <Link
          href={`/app/compare/${analysis.intentContractId}`}
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          <GitCompareArrows className="size-3.5" />
          Offer comparison
        </Link>
      </div>

      <PageHeader
        eyebrow={`Consequence analysis · ${formatDate(analysis.createdAt)}`}
        title={`${offer.providerName} — ${offer.planName}`}
        description={`Offer version ${analysis.offerVersion} · intent version ${analysis.intentVersion} · analysis ${analysis.id}`}
        actions={
          <>
            <DecisionBadge decision={analysis.decision} size="large" />
            {analysis.decision !== "block" ? (
              <ButtonLink href={consentHref}>
                <ShieldCheck className="size-4" />
                {approvalIsCurrent ? "View approval" : "Consent review"}
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="overflow-hidden">
          <Stat
            label="Proposed 12-month cost"
            value={
              <Money
                minor={analysis.totals.proposed12.totalMinor}
                unknownLabel="Incomplete"
              />
            }
            detail={`Current: ${analysis.totals.current12.totalMinor === null ? "unknown" : `$${(analysis.totals.current12.totalMinor / 100).toFixed(2)}`}`}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="12-month difference"
            value={<MoneyDelta minor={analysis.totals.delta12Minor} />}
            detail={
              analysis.totals.averageMonthlySaving12Minor === null
                ? "Not computable"
                : `${analysis.totals.averageMonthlySaving12Minor >= 0 ? "Saves" : "Costs"} $${(Math.abs(analysis.totals.averageMonthlySaving12Minor) / 100).toFixed(2)}/month on average`
            }
            tone={
              analysis.totals.delta12Minor === null
                ? "default"
                : analysis.totals.delta12Minor > 0
                  ? "danger"
                  : "accent"
            }
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="24-month difference"
            value={<MoneyDelta minor={analysis.totals.delta24Minor} />}
            detail="Full term, including promotion expiry and fees"
            tone={
              analysis.totals.delta24Minor === null
                ? "default"
                : analysis.totals.delta24Minor > 0
                  ? "danger"
                  : "accent"
            }
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Evidence validity"
            value={formatPercent(
              analysis.evidenceValidation.total === 0
                ? 0
                : analysis.evidenceValidation.valid /
                    analysis.evidenceValidation.total,
            )}
            detail={`${analysis.evidenceValidation.valid}/${analysis.evidenceValidation.total} quotes located`}
            tone={
              analysis.evidenceValidation.invalidEvidenceIds.length > 0
                ? "danger"
                : "accent"
            }
          />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel className={`overflow-hidden border ${decisionTone}`}>
            <div className="border-b border-line/60 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-ink-muted">Overall outcome</div>
                  <div className="mt-1 flex items-center gap-3">
                    <DecisionBadge decision={analysis.decision} size="large" />
                    <span className="text-[12px] text-ink-muted">
                      {analysis.decisionReasons.length} recorded reason
                      {analysis.decisionReasons.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-ink-muted">
                  The LLM does not vote.
                </div>
              </div>
            </div>
            <ul className="divide-y divide-line/60">
              {analysis.decisionReasons.map((reason) => (
                <li key={`${reason.code}-${reason.title}`} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-[13px] font-medium leading-5 text-ink">
                      {reason.title}
                    </div>
                    <SeverityBadge severity={reason.severity} />
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-ink-muted">
                    {reason.detail}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-3 font-mono-num text-[10px] text-ink-faint">
                    <span>{reason.code}</span>
                    {reason.constraint ? <span>{reason.constraint}</span> : null}
                    {reason.evidenceIds.length > 0 ? (
                      <span>{reason.evidenceIds.length} evidence refs</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader
              title="Financial consequence"
              description="Current versus proposed household cost, in integer minor units."
              action={<Money className="text-[13px]" minor={analysis.totals.savings12Minor} />}
            />
            <div className="grid gap-x-8 px-5 py-2 sm:grid-cols-2">
              <dl>
                <KeyValue label="Current 12 months">
                  <Money minor={analysis.totals.current12.totalMinor} unknownLabel="Incomplete" />
                </KeyValue>
                <KeyValue label="Proposed 12 months">
                  <Money minor={analysis.totals.proposed12.totalMinor} unknownLabel="Incomplete" />
                </KeyValue>
                <KeyValue label="Difference, 12 months">
                  <MoneyDelta minor={analysis.totals.delta12Minor} />
                </KeyValue>
                <KeyValue label="Average monthly saving">
                  <Money
                    minor={analysis.totals.averageMonthlySaving12Minor}
                    unknownLabel="Incomplete"
                  />
                </KeyValue>
              </dl>
              <dl>
                <KeyValue label="Current 24 months">
                  <Money minor={analysis.totals.current24.totalMinor} unknownLabel="Incomplete" />
                </KeyValue>
                <KeyValue label="Proposed 24 months">
                  <Money minor={analysis.totals.proposed24.totalMinor} unknownLabel="Incomplete" />
                </KeyValue>
                <KeyValue label="Difference, 24 months">
                  <MoneyDelta minor={analysis.totals.delta24Minor} />
                </KeyValue>
                <KeyValue label="Total savings, 24 months">
                  <Money minor={analysis.totals.savings24Minor} unknownLabel="Incomplete" />
                </KeyValue>
              </dl>
            </div>
            <div className="border-t border-line">
              <ConsequenceItems items={financial} />
            </div>
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <CostBreakdown
              title="Current, 12 months"
              description="Baseline line items."
              tco={analysis.totals.current12}
            />
            <CostBreakdown
              title="Proposed, 12 months"
              description="Offer line items."
              tco={analysis.totals.proposed12}
            />
            <CostBreakdown
              title="Current, 24 months"
              description="Baseline line items."
              tco={analysis.totals.current24}
            />
            <CostBreakdown
              title="Proposed, 24 months"
              description="Offer line items including promotion expiry and fees."
              tco={analysis.totals.proposed24}
            />
          </div>

          <Panel>
            <PanelHeader
              title="Contractual delta"
              description="Term, renewal and exit cost. The current baseline is a month-to-month service."
            />
            <div className="grid gap-x-8 px-5 py-2 sm:grid-cols-2">
              <dl>
                <KeyValue label="Current minimum term">
                  {data.commitments
                    .filter((item) => item.status === "active")
                    .every((item) => item.minimumTermMonths === 0)
                    ? "None"
                    : "See commitments"}
                </KeyValue>
                <KeyValue label="Offer minimum term">
                  {offer.terms.minimumTermMonths === null ? (
                    <span className="text-caution">Not stated</span>
                  ) : (
                    `${offer.terms.minimumTermMonths} months`
                  )}
                </KeyValue>
                <KeyValue label="Renewal type">
                  {humanize(offer.terms.renewalType)}
                </KeyValue>
              </dl>
              <dl>
                <KeyValue label="Early termination fee">
                  <Money minor={offer.terms.cancellationFeeMinor} unknownLabel="Not stated" />
                </KeyValue>
                <KeyValue label="Installation fee">
                  <Money minor={offer.terms.installationFeeMinor} unknownLabel="Not stated" />
                </KeyValue>
                <KeyValue label="Equipment monthly fee">
                  <Money
                    minor={offer.terms.equipmentMonthlyFeeMinor}
                    unknownLabel="Not stated"
                  />
                </KeyValue>
              </dl>
            </div>
            <div className="border-t border-line">
              <ConsequenceItems items={contractual} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Household dependency impact"
              description="Benefits that depend on another service are real money when the link breaks."
            />
            {dependencies.length > 0 ? (
              <ul className="divide-y divide-line">
                {dependencies.map((dependency) => (
                  <li key={dependency.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[12px] text-ink">
                        {dependency.impactDescription}
                      </div>
                      <Money
                        minor={dependency.monthlyImpactMinor}
                        className="text-[12px] text-caution"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={dependencies.length > 0 ? "border-t border-line" : ""}>
              <ConsequenceItems items={householdImpact} />
            </div>
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Reversibility"
                action={<Repeat2 className="size-4 text-ink-faint" />}
              />
              <ConsequenceItems items={reversibility} />
            </Panel>
            <Panel>
              <PanelHeader
                title="Service and data"
                action={<Info className="size-4 text-ink-faint" />}
              />
              <ConsequenceItems items={[...service, ...dataConsequences]} />
            </Panel>
          </div>
        </div>

        <div className="space-y-6">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Exact offer"
              description={`${offer.sourceLabel} · version ${offer.offerVersion}`}
              action={<Badge tone="neutral">{serviceLabel(offer.serviceType)}</Badge>}
            />
            <div className="px-5 py-2">
              <dl>
                <KeyValue label="Provider">{offer.providerName}</KeyValue>
                <KeyValue label="Plan">{offer.planName}</KeyValue>
                <KeyValue label="Advertised monthly">
                  <Money minor={offer.terms.promotionalMonthlyPriceMinor} />
                  {offer.terms.promotionalMonths ? (
                    <span className="ml-1 text-[10px] text-ink-faint">
                      for {offer.terms.promotionalMonths} mo
                    </span>
                  ) : null}
                </KeyValue>
                <KeyValue label="Standard after promotion">
                  <Money minor={offer.terms.standardMonthlyPriceMinor} unknownLabel="Not stated" />
                </KeyValue>
                <KeyValue label="Extraction">
                  {humanize(offer.extractionSource)}
                </KeyValue>
              </dl>
            </div>
          </Panel>

          <EvidenceExplorer
            evidence={evidence}
            sourceTexts={sourceTexts}
            validation={validation}
            now={serverNow()}
          />

          {analysis.unknowns.length > 0 ? (
            <Panel className="overflow-hidden">
              <PanelHeader
                title="What remains unknown"
                description="Unknown is a real value. It is never priced as zero."
                action={
                  <Badge
                    tone={
                      intent?.unknownCriticalTermsPolicy === "block" ? "danger" : "caution"
                    }
                  >
                    Policy: {humanize(intent?.unknownCriticalTermsPolicy ?? "review")}
                  </Badge>
                }
              />
              <ul className="divide-y divide-line">
                {analysis.unknowns.map((unknown) => (
                  <li key={unknown} className="flex gap-2 px-5 py-3">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-caution" />
                    <span className="text-[11px] leading-5 text-ink-muted">{unknown}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Plain-language explanation"
              description="SERV explains the computed result. It is not allowed to change it."
              action={
                <ExplainAnalysisButton
                  analysisId={analysis.id}
                  hasExplanation={Boolean(analysis.servExplanation)}
                />
              }
            />
            {analysis.servExplanation ? (
              <div className="px-5 py-4">
                <p className="text-[13px] leading-6 text-ink">
                  {analysis.servExplanation.summary}
                </p>
                {analysis.servExplanation.materialChanges.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[10px] font-medium text-ink-faint">
                      Material changes
                    </div>
                    <ul className="mt-1.5 space-y-1.5">
                      {analysis.servExplanation.materialChanges.map((item) => (
                        <li key={item} className="flex gap-2 text-[12px] leading-5 text-ink-muted">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {analysis.servExplanation.tradeoffs.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[10px] font-medium text-ink-faint">
                      Trade-offs
                    </div>
                    <ul className="mt-1.5 space-y-1.5">
                      {analysis.servExplanation.tradeoffs.map((item) => (
                        <li key={item} className="flex gap-2 text-[12px] leading-5 text-ink-muted">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-faint" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {analysis.servExplanation.followUpQuestions.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[10px] font-medium text-ink-faint">
                      Questions before consent
                    </div>
                    <ul className="mt-1.5 space-y-1.5">
                      {analysis.servExplanation.followUpQuestions.map((item) => (
                        <li key={item} className="flex gap-2 text-[12px] leading-5 text-ink-muted">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-caution" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 border-t border-line pt-2 font-mono-num text-[10px] text-ink-faint">
                  {analysis.servExplanation.model} · {analysis.servExplanation.latencyMs} ms
                  {analysis.servExplanation.responseId
                    ? ` · ${analysis.servExplanation.responseId}`
                    : ""}
                </div>
              </div>
            ) : (
              <div className="px-5 py-4">
                {analysis.servExplanationError ? (
                  <InlineNotice tone="caution" title="Explanation did not complete">
                    {analysis.servExplanationError}. The decision and receipt are
                    unchanged.
                  </InlineNotice>
                ) : (
                  <p className="text-[12px] leading-5 text-ink-muted">
                    No explanation has been generated. The decision above is complete
                    without it. Generating an explanation calls SERV live and stores the
                    result on this analysis.
                  </p>
                )}
              </div>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Audit trail"
              action={<ReceiptText className="size-4 text-ink-faint" />}
            />
            <div className="px-5 py-2">
              <dl>
                <KeyValue label="Analysis version">
                  {analysis.analysisVersion}
                </KeyValue>
                <KeyValue label="Input hash">
                  <span className="font-mono-num text-[10px]">
                    {analysis.inputHash.slice(0, 22)}…
                  </span>
                </KeyValue>
                <KeyValue label="Intent">
                  {intent ? `v${intent.version} · ${intent.extractionSource}` : "Unavailable"}
                </KeyValue>
                <KeyValue label="Created">
                  {formatDateTime(analysis.createdAt)}
                </KeyValue>
              </dl>
            </div>
            <div className="border-t border-line px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-ink-muted">
                  {bundle.receipts.length} receipt
                  {bundle.receipts.length === 1 ? "" : "s"} for this analysis
                </span>
                <Link
                  href="/app/receipts"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
                >
                  Open receipts
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <ScenarioSandbox
          analysisId={analysis.id}
          currency={intent?.currency ?? "USD"}
          defaults={{
            maxContractMonths: intent?.maxContractMonths ?? null,
            minimumMonthlySavingMinor: intent?.minimumMonthlySavingMinor ?? null,
            maxOneTimeFeeMinor: bundle.policy?.maxOneTimeFeeMinor ?? null,
            familyDiscountRetained:
              offer.terms.familyBundleDiscountRetained ?? null,
          }}
          base={toScenarioOutcome(analysis)}
          familyDiscountExcluded={offer.terms.excludedBenefits.some(
            (item) => item.key === "family_mobile_bundle_discount",
          )}
        />
      </div>

      <div className="mt-6">
        <ReasoningTracePanel trace={reasoningTrace} />
      </div>

      <div className="mt-6">
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
            <div className="max-w-[62ch]">
              <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
                {analysis.decision === "allow" ? (
                  <CheckCircle2 className="size-4 text-ok" />
                ) : analysis.decision === "review" ? (
                  <CircleAlert className="size-4 text-caution" />
                ) : (
                  <ShieldAlert className="size-4 text-danger" />
                )}
                Next step
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">
                {analysis.decision === "allow"
                  ? "This offer meets the confirmed hard constraints. Review the exact consequences and explicitly approve them before a payment session can be requested."
                  : analysis.decision === "review"
                    ? "A material term is unknown or the evidence is incomplete. Resolve it — or choose an offer that can be fully priced — before consent."
                    : "This offer cannot be approved. The hard-constraint failure is not a warning; return to the comparison and choose a compliant offer."}
              </p>
              {execution ? (
                <div className="mt-2 text-[11px] text-ink-faint">
                  Execution status: {humanize(execution.status)} ·{" "}
                  {execution.executionMode === "simulated" ? "Simulated" : "Kite x402"}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RecalculateAnalysisButton analysisId={analysis.id} />
              {analysis.decision === "block" ? (
                <ButtonLink href={`/app/compare/${analysis.intentContractId}`} variant="secondary">
                  <GitCompareArrows className="size-4" />
                  Choose another offer
                </ButtonLink>
              ) : execution ? (
                <ButtonLink href={`/app/executions/${execution.id}`}>
                  <LockKeyhole className="size-4" />
                  Open payment panel
                </ButtonLink>
              ) : (
                <ButtonLink href={consentHref}>
                  <ShieldCheck className="size-4" />
                  Review consent
                </ButtonLink>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
