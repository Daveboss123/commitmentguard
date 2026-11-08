import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  GitCompareArrows,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  DecisionBadge,
  EmptyState,
  InlineNotice,
  Money,
  MoneyDelta,
  PageHeader,
  Panel,
  PanelHeader,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { AnalyseOfferButton } from "@/components/analyse-offer-button";
import { getPageContext } from "@/lib/page/context";
import { getHouseholdData } from "@/lib/page/data";
import { calculateCurrentTco } from "@/lib/domain/tco";
import { formatDate, humanize, serviceLabel } from "@/lib/format";
import type { Analysis, Offer } from "@/lib/domain/types";

export const metadata: Metadata = {
  title: "Offer comparison",
};

function oneOffFees(offer: Offer): string {
  const parts: string[] = [];
  if (offer.terms.installationFeeMinor === null) parts.push("Installation not stated");
  else if (offer.terms.installationFeeMinor > 0)
    parts.push(`Installation $${(offer.terms.installationFeeMinor / 100).toFixed(2)}`);
  if (offer.terms.activationFeeMinor === null) parts.push("Activation not stated");
  else if (offer.terms.activationFeeMinor > 0)
    parts.push(`Activation $${(offer.terms.activationFeeMinor / 100).toFixed(2)}`);
  if (offer.terms.equipmentMonthlyFeeMinor === null) parts.push("Equipment not stated");
  else if (offer.terms.equipmentMonthlyFeeMinor > 0)
    parts.push(`Equipment $${(offer.terms.equipmentMonthlyFeeMinor / 100).toFixed(2)}/mo`);
  return parts.length > 0 ? parts.join(" · ") : "None";
}

export default async function OfferComparisonPage({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  const { intentId } = await params;
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);
  const intent = data.intents.find((item) => item.id === intentId);
  if (!intent) notFound();

  const analyses = data.analyses.filter(
    (item) => item.intentContractId === intentId,
  );
  const analysesByOffer = new Map(analyses.map((analysis) => [analysis.offerId, analysis]));

  const current12 = calculateCurrentTco({
    commitments: data.commitments,
    benefits: data.benefits,
    dependencies: data.dependencies,
    horizonMonths: 12,
  });
  const current24 = calculateCurrentTco({
    commitments: data.commitments,
    benefits: data.benefits,
    dependencies: data.dependencies,
    horizonMonths: 24,
  });

  const householdOffers = data.offers;
  const analysed = householdOffers
    .map((offer) => ({ offer, analysis: analysesByOffer.get(offer.id) ?? null }))
    .filter((item): item is { offer: Offer; analysis: Analysis } => Boolean(item.analysis));

  const blocked = analysed.filter((item) => item.analysis.decision === "block");
  const review = analysed.filter((item) => item.analysis.decision === "review");
  const allowed = analysed.filter((item) => item.analysis.decision === "allow");

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/app/compare"
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink"
        >
          <GitCompareArrows className="size-3.5" />
          New comparison
        </Link>
      </div>

      <PageHeader
        eyebrow="Offer comparison"
        title="The full consequence, side by side"
        description={`Intent v${intent.version} · confirmed ${formatDate(intent.userConfirmedAt)} · ${intent.extractionSource === "serv" ? "SERV extraction" : "Labelled demo parser"}`}
        actions={
          <ButtonLink href="/app/analyses" variant="secondary">
            All analyses
          </ButtonLink>
        }
      />

      <Panel className="mb-6 overflow-hidden">
        <PanelHeader
          title="Confirmed request"
          description={intent.goal}
          action={<Badge tone="accent">Intent v{intent.version}</Badge>}
        />
        <div className="grid gap-x-8 gap-y-3 px-5 py-4 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[10px] text-ink-faint">Original request</div>
            <p className="mt-1 line-clamp-3 leading-5 text-ink-muted">
              “{intent.originalRequest}”
            </p>
          </div>
          <div>
            <div className="text-[10px] text-ink-faint">Hard constraints</div>
            <ul className="mt-1 space-y-1 text-ink">
              <li>
                Saving floor:{" "}
                <span className="font-mono-num">
                  {intent.minimumMonthlySavingMinor === null
                    ? "None"
                    : `$${(intent.minimumMonthlySavingMinor / 100).toFixed(2)}/mo`}
                </span>
              </li>
              <li>
                Max term:{" "}
                <span className="font-mono-num">
                  {intent.maxContractMonths === null
                    ? "None"
                    : `${intent.maxContractMonths} months`}
                </span>
              </li>
              <li>Unknowns: {humanize(intent.unknownCriticalTermsPolicy)}</li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] text-ink-faint">Benefits to keep</div>
            <p className="mt-1 leading-5 text-ink">
              {intent.mustKeepBenefits.length > 0
                ? intent.mustKeepBenefits.join(", ")
                : "None listed"}
            </p>
          </div>
          <div>
            <div className="text-[10px] text-ink-faint">Must not have</div>
            <p className="mt-1 leading-5 text-ink">
              {intent.mustNotHave.length > 0
                ? intent.mustNotHave.join(", ")
                : "None listed"}
            </p>
          </div>
        </div>
      </Panel>

      {analyses.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<GitCompareArrows className="size-4" />}
            title="No offer has been analysed yet"
            description="Run the deterministic engine against at least one offer. The comparison will then show 12- and 24-month totals, lost benefits, unknowns and evidence validity."
            action={
              householdOffers[0] ? (
                <AnalyseOfferButton
                  intentId={intent.id}
                  offerId={householdOffers[0].id}
                  label="Analyse the first offer"
                />
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-danger">
                <ShieldAlert className="size-3.5" />
                Blocked
              </div>
              <div className="mt-1 font-display text-[24px] leading-none text-danger">
                {blocked.length}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-danger/80">
                A hard constraint or evidence failure cannot be approved away.
              </p>
            </div>
            <div className="rounded-xl border border-caution/25 bg-caution-soft px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-caution">
                <CircleAlert className="size-3.5" />
                Needs review
              </div>
              <div className="mt-1 font-display text-[24px] leading-none text-caution">
                {review.length}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-caution/80">
                Unknown or incomplete terms. The total is not presented as complete.
              </p>
            </div>
            <div className="rounded-xl border border-ok/25 bg-ok-soft px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-ok">
                <CheckCircle2 className="size-3.5" />
                Allowed
              </div>
              <div className="mt-1 font-display text-[24px] leading-none text-ok">
                {allowed.length}
              </div>
              <p className="mt-1 text-[11px] leading-4 text-ok/80">
                Meets every hard constraint. Consent is still required before payment.
              </p>
            </div>
          </div>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Cost and consequence matrix"
              description="Every total is integer minor units. “Unknown” is never rendered as zero."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-[12px]">
                <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                  <tr>
                    <th className="w-[180px] px-5 py-3 font-medium">Measure</th>
                    <th className="px-5 py-3 font-medium">Current household</th>
                    {householdOffers.map((offer) => {
                      const analysis = analysesByOffer.get(offer.id);
                      return (
                        <th key={offer.id} className="px-5 py-3 font-medium">
                          <div className="text-[12px] text-ink">
                            {offer.providerName}
                          </div>
                          <div className="mt-0.5 font-normal text-ink-faint">
                            {offer.planName}
                          </div>
                          <div className="mt-1">
                            {analysis ? (
                              <DecisionBadge decision={analysis.decision} />
                            ) : (
                              <Badge tone="neutral">Not analysed</Badge>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">Service</td>
                    <td className="px-5 py-3 text-ink">
                      {data.commitments
                        .filter((item) => item.status === "active")
                        .map((item) => `${item.providerName} ${serviceLabel(item.serviceType).toLowerCase()}`)
                        .join(" + ")}
                    </td>
                    {householdOffers.map((offer) => (
                      <td key={offer.id} className="px-5 py-3 text-ink">
                        {serviceLabel(offer.serviceType)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">Advertised monthly</td>
                    <td className="px-5 py-3">
                      <Money
                        minor={
                          current12.totalMinor === null
                            ? null
                            : Math.trunc(current12.totalMinor / 12)
                        }
                      />
                      <span className="ml-1 text-[10px] text-ink-faint">
                        net average
                      </span>
                    </td>
                    {householdOffers.map((offer) => (
                      <td key={offer.id} className="px-5 py-3">
                        <Money minor={offer.terms.promotionalMonthlyPriceMinor} />
                        {offer.terms.promotionalMonths ? (
                          <div className="text-[10px] text-ink-faint">
                            for {offer.terms.promotionalMonths} months
                          </div>
                        ) : (
                          <div className="text-[10px] text-ink-faint">no promotion</div>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">Standard after promotion</td>
                    <td className="px-5 py-3 text-ink-faint">Not applicable</td>
                    {householdOffers.map((offer) => (
                      <td key={offer.id} className="px-5 py-3">
                        <Money
                          minor={offer.terms.standardMonthlyPriceMinor}
                          unknownLabel="Not stated"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">One-off and equipment fees</td>
                    <td className="px-5 py-3 text-ink-faint">None recorded</td>
                    {householdOffers.map((offer) => (
                      <td key={offer.id} className="px-5 py-3 leading-5 text-ink">
                        {oneOffFees(offer)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">12-month total</td>
                    <td className="px-5 py-3 font-medium text-ink">
                      <Money minor={current12.totalMinor} />
                    </td>
                    {householdOffers.map((offer) => {
                      const analysis = analysesByOffer.get(offer.id);
                      return (
                        <td key={offer.id} className="px-5 py-3 font-medium text-ink">
                          <Money
                            minor={analysis?.totals.proposed12.totalMinor ?? null}
                            unknownLabel={analysis ? "Incomplete" : "Not analysed"}
                          />
                          {analysis?.totals.delta12Minor !== null &&
                          analysis?.totals.delta12Minor !== undefined ? (
                            <div className="mt-0.5 text-[10px]">
                              <MoneyDelta minor={analysis.totals.delta12Minor} />
                              <span className="text-ink-faint"> vs current</span>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">24-month total</td>
                    <td className="px-5 py-3 font-medium text-ink">
                      <Money minor={current24.totalMinor} />
                    </td>
                    {householdOffers.map((offer) => {
                      const analysis = analysesByOffer.get(offer.id);
                      return (
                        <td key={offer.id} className="px-5 py-3 font-medium text-ink">
                          <Money
                            minor={analysis?.totals.proposed24.totalMinor ?? null}
                            unknownLabel={analysis ? "Incomplete" : "Not analysed"}
                          />
                          {analysis?.totals.delta24Minor !== null &&
                          analysis?.totals.delta24Minor !== undefined ? (
                            <div className="mt-0.5 text-[10px]">
                              <MoneyDelta minor={analysis.totals.delta24Minor} />
                              <span className="text-ink-faint"> vs current</span>
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">Contract term</td>
                    <td className="px-5 py-3 text-ink">
                      {data.commitments
                        .filter((item) => item.status === "active")
                        .every((item) => item.minimumTermMonths === 0)
                        ? "Month to month"
                        : "See commitments"}
                    </td>
                    {householdOffers.map((offer) => (
                      <td key={offer.id} className="px-5 py-3">
                        {offer.terms.minimumTermMonths === null ? (
                          <span className="text-caution">Not stated</span>
                        ) : (
                          <span
                            className={
                              intent.maxContractMonths !== null &&
                              offer.terms.minimumTermMonths > intent.maxContractMonths
                                ? "font-medium text-danger"
                                : "text-ink"
                            }
                          >
                            {offer.terms.minimumTermMonths} months
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">Lost benefits</td>
                    <td className="px-5 py-3 text-ink-faint">Baseline</td>
                    {householdOffers.map((offer) => {
                      const lost = offer.terms.excludedBenefits;
                      const unknown = offer.terms.familyBundleDiscountRetained === null;
                      return (
                        <td key={offer.id} className="px-5 py-3 leading-5">
                          {lost.length > 0 ? (
                            <span className="text-danger">
                              {lost.map((item) => item.description).join(", ")}
                            </span>
                          ) : unknown ? (
                            <span className="text-caution">
                              Family discount impact not addressed
                            </span>
                          ) : (
                            <span className="text-ok">Benefits retained</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">Unknowns</td>
                    <td className="px-5 py-3 text-ink-faint">Verified baseline</td>
                    {householdOffers.map((offer) => {
                      const unknowns =
                        analysesByOffer.get(offer.id)?.unknowns ??
                        offer.terms.materialUnknowns;
                      return (
                        <td key={offer.id} className="px-5 py-3 leading-5">
                          {unknowns.length === 0 ? (
                            <span className="text-ok">None material</span>
                          ) : (
                            <div className="text-caution">
                              <div className="font-medium">
                                {unknowns.length} unresolved
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-[10px]">
                                {unknowns.join("; ")}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">Evidence</td>
                    <td className="px-5 py-3 text-ink">
                      {data.evidence.filter((item) => item.status === "verified").length} verified facts
                    </td>
                    {householdOffers.map((offer) => {
                      const analysis = analysesByOffer.get(offer.id);
                      return (
                        <td key={offer.id} className="px-5 py-3">
                          {analysis ? (
                            <Link
                              href={`/app/analyses/${analysis.id}#evidence`}
                              className="text-accent hover:text-accent-strong"
                            >
                              {analysis.evidenceValidation.valid}/
                              {analysis.evidenceValidation.total} quotes valid
                            </Link>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="px-5 py-3 text-ink-muted">Action</td>
                    <td className="px-5 py-3 text-ink-faint">—</td>
                    {householdOffers.map((offer) => {
                      const analysis = analysesByOffer.get(offer.id);
                      return (
                        <td key={offer.id} className="px-5 py-3">
                          {analysis ? (
                            <Link
                              href={`/app/analyses/${analysis.id}`}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
                            >
                              Open analysis
                              <ArrowRight className="size-3" />
                            </Link>
                          ) : (
                            <AnalyseOfferButton intentId={intent.id} offerId={offer.id} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {householdOffers.map((offer) => {
              const analysis = analysesByOffer.get(offer.id);
              if (!analysis) return null;
              return (
                <Panel key={offer.id} className="flex flex-col p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-medium text-ink">
                      {offer.providerName}
                    </div>
                    <DecisionBadge decision={analysis.decision} />
                  </div>
                  <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-ink-muted">
                    {analysis.decisionReasons[0]?.detail ??
                      "No material reason was recorded."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {analysis.decisionReasons.slice(0, 2).map((reason) => (
                      <Badge
                        key={reason.code}
                        tone={
                          reason.severity === "critical" || reason.severity === "high"
                            ? "danger"
                            : reason.severity === "medium"
                              ? "caution"
                              : "neutral"
                        }
                      >
                        {humanize(reason.code)}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
                    <span className="text-[11px] text-ink-faint">
                      {analysis.decision === "allow"
                        ? "Consent is the next step"
                        : analysis.decision === "review"
                          ? "Resolve unknowns first"
                          : "Cannot be approved"}
                    </span>
                    <Link
                      href={`/app/analyses/${analysis.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
                    >
                      Open
                      <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </Panel>
              );
            })}
          </div>

          {allowed.length > 0 ? (
            <div className="mt-6">
              <InlineNotice tone="ok" title="A compliant offer exists">
                {allowed
                  .map((item) => item.offer.providerName)
                  .join(" and ")}{" "}
                meets the confirmed hard constraints. Open the consequence analysis to
                review every effect, then consent to the exact offer version.
              </InlineNotice>
            </div>
          ) : blocked.length > 0 ? (
            <div className="mt-6">
              <InlineNotice tone="danger" title="Every analysed offer is blocked">
                Do not proceed with a switch. Adjust the household constraints or find
                an offer that preserves the family benefit and stays within 12 months.
              </InlineNotice>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
