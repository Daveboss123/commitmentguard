import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui";
import { NewComparisonFlow } from "@/components/new-comparison-flow";
import { getPageContext } from "@/lib/page/context";
import { getHouseholdData, currentMonthlyCostMinor } from "@/lib/page/data";
import { getServStatus } from "@/lib/integrations/serv/service";
import { DEMO_REQUEST } from "@/lib/fixtures/demo";
import type { Offer } from "@/lib/domain/types";

export const metadata: Metadata = {
  title: "New comparison",
};

function toWizardOffer(offer: Offer) {
  return {
    id: offer.id,
    providerName: offer.providerName,
    planName: offer.planName,
    sourceLabel: offer.sourceLabel,
    offerVersion: offer.offerVersion,
    status: offer.status,
    promoPriceMinor: offer.terms.promotionalMonthlyPriceMinor,
    promoMonths: offer.terms.promotionalMonths,
    standardPriceMinor: offer.terms.standardMonthlyPriceMinor,
    minimumTermMonths: offer.terms.minimumTermMonths,
    installationFeeMinor: offer.terms.installationFeeMinor,
    cancellationFeeMinor: offer.terms.cancellationFeeMinor,
    excludedBenefits: offer.terms.excludedBenefits.map((item) => item.description),
    unknowns: offer.terms.materialUnknowns,
  };
}

export default async function ComparePage() {
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);
  const serv = await getServStatus(false);
  const monthlyAverage = currentMonthlyCostMinor(data);

  return (
    <div>
      <PageHeader
        eyebrow="Decisions"
        title="New comparison"
        description="Describe the outcome the household wants in plain English. SERV proposes the structured constraints; the household confirms them before the engine runs."
        actions={
          <Link
            href="/app/analyses"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-strong"
          >
            Existing analyses
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="space-y-5">
          <Panel className="p-5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <GitCompareArrows className="size-4 text-accent" />
              Current baseline
            </div>
            <div className="mt-3 font-display text-[30px] leading-none text-ink">
              {monthlyAverage === null ? (
                "Unknown"
              ) : (
                <>
                  ${(monthlyAverage / 100).toFixed(2)}
                  <span className="ml-1 font-sans text-[12px] font-normal text-ink-faint">
                    / month
                  </span>
                </>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-4 text-ink-faint">
              Average over 12 months, after active benefits.
            </p>
            <dl className="mt-4 space-y-2 border-t border-line pt-3 text-[12px]">
              {data.commitments
                .filter((item) => item.status === "active")
                .map((commitment) => (
                  <div key={commitment.id} className="flex justify-between gap-3">
                    <dt className="text-ink-muted">
                      {commitment.providerName} · {commitment.planName}
                    </dt>
                    <dd className="font-mono-num text-ink">
                      ${(commitment.recurringChargeMinor / 100).toFixed(2)}
                    </dd>
                  </div>
                ))}
              {data.benefits
                .filter((item) => item.status === "active")
                .map((benefit) => (
                  <div key={benefit.id} className="flex justify-between gap-3 text-accent">
                    <dt>{benefit.description}</dt>
                    <dd className="font-mono-num">
                      −${((benefit.valueMinor ?? 0) / 100).toFixed(2)}
                    </dd>
                  </div>
                ))}
            </dl>
          </Panel>

          {data.policy ? (
            <Panel className="p-5">
              <div className="text-[12px] font-medium text-ink">Household policy</div>
              <p className="mt-1 text-[11px] leading-4 text-ink-faint">
                Version {data.policy.version}. The engine checks these rules; SERV
                cannot relax them.
              </p>
              <dl className="mt-3 space-y-2 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Minimum monthly saving</dt>
                  <dd className="font-mono-num text-ink">
                    {data.policy.minimumMonthlySavingMinor === null
                      ? "None"
                      : `$${(data.policy.minimumMonthlySavingMinor / 100).toFixed(2)}`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Maximum contract</dt>
                  <dd className="text-ink">
                    {data.policy.maxContractMonths === null
                      ? "None"
                      : `${data.policy.maxContractMonths} months`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Benefits to keep</dt>
                  <dd className="text-right text-ink">
                    {data.policy.mustKeepBenefits.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Unknown critical terms</dt>
                  <dd className="text-ink">
                    {data.policy.unknownCriticalTermsPolicy === "block"
                      ? "Block"
                      : "Review"}
                  </dd>
                </div>
              </dl>
            </Panel>
          ) : null}
        </div>

        <NewComparisonFlow
          householdId={household.id}
          demoRequest={DEMO_REQUEST}
          servConfigured={serv.configured}
          servModel={serv.model}
          offers={data.offers.map(toWizardOffer)}
        />
      </div>
    </div>
  );
}
