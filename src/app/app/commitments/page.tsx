import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Link2, ScrollText, Sparkles } from "lucide-react";
import {
  Badge,
  Money,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { getPageContext } from "@/lib/page/context";
import {
  currentMonthlyCostMinor,
  evidenceForCommitment,
  getHouseholdData,
  monthlyRecurringMinor,
  verifiedEvidenceCount,
} from "@/lib/page/data";
import { formatDate, humanize, serviceLabel } from "@/lib/format";

export const metadata: Metadata = {
  title: "Household commitments",
};

export default async function CommitmentsPage() {
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);

  const active = data.commitments.filter((item) => item.status === "active");
  const benefitTotal = data.benefits
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + (item.valueMinor ?? 0), 0);
  const monthlyAverage = currentMonthlyCostMinor(data);
  const grossMonthly = monthlyRecurringMinor(data) + benefitTotal;

  return (
    <div>
      <PageHeader
        eyebrow="Household"
        title="Commitments"
        description="The baseline every offer is measured against. Prices, terms and benefits stay tied to their source evidence."
        actions={
          <ButtonLink href="/app/compare" variant="secondary">
            <ScrollText className="size-4" />
            Compare an offer
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="overflow-hidden">
          <Stat
            label="Net monthly cost"
            value={<Money minor={monthlyAverage} />}
            detail="Average over 12 months, after active benefits"
            tone="accent"
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Gross recurring charges"
            value={<Money minor={grossMonthly} />}
            detail={`${active.length} active service${active.length === 1 ? "" : "s"}`}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Retained benefits"
            value={<Money minor={benefitTotal} />}
            detail={`${data.benefits.filter((item) => item.status === "active").length} active benefit${data.benefits.length === 1 ? "" : "s"}`}
          />
        </Panel>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {active.map((commitment) => {
          const benefits = data.benefits.filter(
            (benefit) => benefit.commitmentId === commitment.id,
          );
          const dependencies = data.dependencies.filter(
            (dependency) =>
              dependency.fromCommitmentId === commitment.id ||
              dependency.toCommitmentId === commitment.id,
          );
          const evidence = evidenceForCommitment(data, commitment);
          return (
            <Panel key={commitment.id} className="flex flex-col overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-[21px] leading-tight text-ink">
                      {commitment.providerName}
                    </h2>
                    <Badge tone="neutral">{serviceLabel(commitment.serviceType)}</Badge>
                    <Badge tone={commitment.status === "active" ? "ok" : "neutral"}>
                      {humanize(commitment.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    {commitment.planName}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-display text-[26px] leading-none text-ink">
                    <Money minor={commitment.recurringChargeMinor} />
                  </div>
                  <div className="mt-1 text-[11px] text-ink-faint">
                    per {commitment.billingPeriod === "monthly" ? "month" : commitment.billingPeriod}
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-[12px]">
                <div>
                  <dt className="text-[10px] text-ink-faint">Contract duration</dt>
                  <dd className="mt-0.5 text-ink">
                    {commitment.minimumTermMonths === 0
                      ? "Month to month"
                      : `${commitment.minimumTermMonths} months`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-ink-faint">Renewal date</dt>
                  <dd className="mt-0.5 text-ink">
                    {commitment.contractEnd
                      ? formatDate(commitment.contractEnd)
                      : commitment.promoEndDate
                        ? `Promo ends ${formatDate(commitment.promoEndDate)}`
                        : "Rolling"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-ink-faint">Renewal type</dt>
                  <dd className="mt-0.5 text-ink">{humanize(commitment.renewalType)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-ink-faint">Data allowance</dt>
                  <dd className="mt-0.5 text-ink">
                    {commitment.dataAllowance ?? "Not applicable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-ink-faint">Equipment</dt>
                  <dd className="mt-0.5 text-ink">
                    {commitment.routerIncluded === null
                      ? "Not stated"
                      : commitment.routerIncluded
                        ? "Router included"
                        : "Router not included"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] text-ink-faint">Cancellation fee</dt>
                  <dd className="mt-0.5 text-ink">
                    <Money minor={commitment.cancellationFeeMinor} unknownLabel="Not stated" />
                  </dd>
                </div>
              </dl>

              {benefits.length > 0 ? (
                <div className="mx-5 mb-4 rounded-lg border border-accent/25 bg-accent-soft px-4 py-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-accent-strong">
                    <Sparkles className="size-3.5" />
                    Included benefits
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {benefits.map((benefit) => (
                      <li
                        key={benefit.id}
                        className="flex items-center justify-between gap-3 text-[12px] text-ink"
                      >
                        <span>{benefit.description}</span>
                        <Money
                          minor={benefit.valueMinor}
                          className="text-[12px] text-accent-strong"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {dependencies.map((dependency) => {
                const counterpart = data.commitments.find(
                  (item) =>
                    item.id ===
                    (dependency.fromCommitmentId === commitment.id
                      ? dependency.toCommitmentId
                      : dependency.fromCommitmentId),
                );
                return (
                  <div
                    key={dependency.id}
                    className="mx-5 mb-4 flex items-start gap-2 rounded-lg border border-caution/25 bg-caution-soft px-4 py-3 text-[11px] leading-5 text-caution"
                  >
                    <Link2 className="mt-0.5 size-3.5 shrink-0" />
                    <div>
                      <span className="font-medium">Linked to {counterpart?.providerName ?? "another service"}. </span>
                      {dependency.impactDescription}
                    </div>
                  </div>
                );
              })}

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5 text-ink-faint" />
                    v{commitment.version}
                  </span>
                  <span>
                    Evidence: {verifiedEvidenceCount(evidence)}/{evidence.length} verified
                  </span>
                  {evidence.some((item) => item.status === "user_provided") ? (
                    <Badge tone="info">Household-entered</Badge>
                  ) : null}
                </div>
                <Link
                  href={`/app/commitments/${commitment.id}`}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-strong"
                >
                  Open detail
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="mt-6">
        <Panel>
          <PanelHeader
            title="Dependency map"
            description="A discount that depends on another service is a real monthly cost when the link breaks."
          />
          <ul className="divide-y divide-line">
            {data.dependencies.map((dependency) => {
              const from = data.commitments.find(
                (item) => item.id === dependency.fromCommitmentId,
              );
              const to = data.commitments.find(
                (item) => item.id === dependency.toCommitmentId,
              );
              return (
                <li
                  key={dependency.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-medium text-ink">
                      {from?.providerName ?? "Unknown service"}
                    </span>
                    <ArrowRight className="size-3.5 text-ink-faint" />
                    <span className="font-medium text-ink">
                      {to?.providerName ?? "Household benefit"}
                    </span>
                    <Badge tone="caution">{humanize(dependency.dependencyType)}</Badge>
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    {dependency.monthlyImpactMinor !== null ? (
                      <>
                        <Money minor={dependency.monthlyImpactMinor} /> / month at risk
                      </>
                    ) : (
                      "Impact value unknown"
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
