import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  GitCompareArrows,
  Plug,
  ReceiptText,
  ScrollText,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  DecisionBadge,
  Dot,
  EmptyState,
  InlineNotice,
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
  getHouseholdData,
  monthlyRecurringMinor,
} from "@/lib/page/data";
import { formatDate, formatDateTime, humanize, serviceLabel } from "@/lib/format";
import { getKiteStatus } from "@/lib/services/execution.service";
import { getServStatus } from "@/lib/integrations/serv/service";
import { demoLabels } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);

  const [servResult, kiteResult] = await Promise.allSettled([
    getServStatus(false),
    getKiteStatus(),
  ]);
  const serv = servResult.status === "fulfilled" ? servResult.value : null;
  const kite = kiteResult.status === "fulfilled" ? kiteResult.value : null;

  const monthlyAverage = currentMonthlyCostMinor(data);
  const grossMonthly = monthlyRecurringMinor(data);
  const benefitMonthly = data.benefits
    .filter((item) => item.status === "active" && item.billingPeriod === "monthly")
    .reduce((sum, item) => sum + (item.valueMinor ?? 0), 0);

  const latestPerOffer = data.offers
    .map((offer) => data.analyses.find((analysis) => analysis.offerId === offer.id))
    .filter((analysis): analysis is NonNullable<typeof analysis> => Boolean(analysis));

  const savingsUnderReviewMinor = latestPerOffer
    .filter((analysis) => analysis.decision !== "block")
    .reduce((sum, analysis) => sum + Math.max(analysis.totals.savings12Minor ?? 0, 0), 0);

  const recentDecisions = data.analyses.slice(0, 5);
  const commitments = data.commitments.filter((item) => item.status === "active");
  const upcoming = commitments
    .flatMap((commitment) => {
      const dates = [
        commitment.contractEnd
          ? { label: "Contract end", date: commitment.contractEnd }
          : null,
        commitment.promoEndDate
          ? { label: "Promotion ends", date: commitment.promoEndDate }
          : null,
      ].filter((item): item is { label: string; date: string } => Boolean(item));
      return dates.map((item) => ({ ...item, commitment }));
    })
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 4);

  const activeAnalyses = data.analyses.filter(
    (analysis) => analysis.status === "completed",
  );

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title={household.name}
        description={`${demoLabels.household} with a seeded ledger and illustrative provider terms. Decisions below are computed by the deterministic engine, never by a language model.`}
        actions={
          <>
            <ButtonLink href="/app/commitments" variant="secondary">
              <ScrollText className="size-4" />
              Commitments
            </ButtonLink>
            <ButtonLink href="/app/compare">
              <GitCompareArrows className="size-4" />
              New comparison
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="overflow-hidden">
          <Stat
            label="Monthly household cost"
            value={<Money minor={monthlyAverage} />}
            detail={
              benefitMonthly > 0
                ? `Net of ${benefitMonthly / 100} ${data.policy?.currency ?? "USD"} in retained benefits`
                : "Average over the next 12 months"
            }
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Gross recurring charges"
            value={<Money minor={grossMonthly + benefitMonthly} />}
            detail={`${commitments.length} active commitment${commitments.length === 1 ? "" : "s"}`}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Potential savings under review"
            value={<Money minor={savingsUnderReviewMinor} />}
            detail="Offers that are not blocked, before any approval"
            tone="accent"
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Completed analyses"
            value={activeAnalyses.length}
            detail={`${data.approvals.filter((item) => item.decision === "approve").length} recorded approval${data.approvals.length === 1 ? "" : "s"}`}
          />
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader
              title="Household commitments"
              description="What the household already pays for, what it depends on, and how strong the evidence is."
              action={
                <Link
                  href="/app/commitments"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-strong"
                >
                  View all
                  <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <ul className="divide-y divide-line">
              {commitments.map((commitment) => {
                const benefits = data.benefits.filter(
                  (benefit) => benefit.commitmentId === commitment.id,
                );
                const dependencies = data.dependencies.filter(
                  (dependency) =>
                    dependency.fromCommitmentId === commitment.id ||
                    dependency.toCommitmentId === commitment.id,
                );
                const evidence = data.evidence.filter((item) =>
                  commitment.evidenceIds.includes(item.id),
                );
                const benefitTotal = benefits
                  .filter((item) => item.status === "active")
                  .reduce((sum, item) => sum + (item.valueMinor ?? 0), 0);
                return (
                  <li key={commitment.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-medium text-ink">
                            {commitment.providerName}
                          </span>
                          <Badge tone="neutral">
                            {serviceLabel(commitment.serviceType)}
                          </Badge>
                          {commitment.renewalType === "monthly" ? (
                            <Badge tone="ok">Month to month</Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[12px] text-ink-muted">
                          {commitment.planName}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-[22px] leading-none text-ink">
                          <Money minor={commitment.recurringChargeMinor} />
                        </div>
                        <div className="mt-1 text-[11px] text-ink-faint">
                          per {commitment.billingPeriod === "monthly" ? "month" : commitment.billingPeriod}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-ink-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="size-3.5 text-ink-faint" />
                        {commitment.minimumTermMonths === 0
                          ? "No minimum term"
                          : `${commitment.minimumTermMonths}-month term`}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ReceiptText className="size-3.5 text-ink-faint" />
                        {evidence.filter((item) => item.status === "verified").length}/
                        {evidence.length} facts verified
                      </span>
                      {benefitTotal > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-accent">
                          <Sparkles className="size-3.5" />
                          <Money minor={benefitTotal} /> in benefits
                        </span>
                      ) : null}
                    </div>

                    {dependencies.map((dependency) => (
                      <div
                        key={dependency.id}
                        className="mt-3 rounded-lg border border-caution/25 bg-caution-soft px-3 py-2 text-[11px] leading-5 text-caution"
                      >
                        <span className="font-medium">Dependency.</span>{" "}
                        {dependency.impactDescription}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader
              title="Analyses"
              description="Every completed run against the current ledger. An old analysis is never rewritten by a new result."
              action={
                <Link
                  href="/app/analyses"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-strong"
                >
                  All analyses
                  <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            {recentDecisions.length === 0 ? (
              <EmptyState
                icon={<GitCompareArrows className="size-4" />}
                title="No analyses yet"
                description="Start a comparison to extract the household constraints with SERV and run the deterministic engine against the three illustrative offers."
                action={
                  <ButtonLink href="/app/compare" variant="secondary">
                    Start the demo comparison
                  </ButtonLink>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-[12px]">
                  <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Offer</th>
                      <th className="px-5 py-2.5 font-medium">Decision</th>
                      <th className="px-5 py-2.5 text-right font-medium">12-month saving</th>
                      <th className="px-5 py-2.5 font-medium">Evidence</th>
                      <th className="px-5 py-2.5 font-medium">Run</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {recentDecisions.map((analysis) => {
                      const offer = data.offers.find(
                        (item) => item.id === analysis.offerId,
                      );
                      return (
                        <tr key={analysis.id} className="hover:bg-surface">
                          <td className="px-5 py-3">
                            <div className="font-medium text-ink">
                              {offer?.providerName ?? "Offer"}
                            </div>
                            <div className="text-[11px] text-ink-faint">
                              {offer?.planName ?? analysis.offerId}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <DecisionBadge decision={analysis.decision} />
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Money minor={analysis.totals.savings12Minor} />
                          </td>
                          <td className="px-5 py-3">
                            <span className="font-mono-num text-[11px] text-ink-muted">
                              {analysis.evidenceValidation.valid}/
                              {analysis.evidenceValidation.total} valid
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[11px] text-ink-faint">
                            {formatDate(analysis.createdAt)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Link
                              href={`/app/analyses/${analysis.id}`}
                              className="text-[11px] font-medium text-accent hover:text-accent-strong"
                            >
                              Open
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

        <div className="min-w-0 space-y-6">
          <Panel>
            <PanelHeader
              title="Integration health"
              description="Only configured capabilities are shown as available."
              action={<Plug className="size-4 text-ink-faint" />}
            />
            <div className="divide-y divide-line">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <Dot tone={serv?.configured ? "ok" : "danger"} />
                    SERV Reasoning
                  </div>
                  <Badge tone={serv?.configured ? "ok" : "danger"}>
                    {serv?.configured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                <dl className="mt-3 space-y-1.5 text-[11px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Model</dt>
                    <dd className="font-mono-num text-ink">{serv?.model ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Reachability</dt>
                    <dd className="text-ink">
                      {serv?.reachable === null || serv?.reachable === undefined
                        ? "Not probed"
                        : serv.reachable
                          ? "Reachable"
                          : "Unreachable"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Purpose</dt>
                    <dd className="text-right text-ink">Extract & explain</dd>
                  </div>
                </dl>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <Dot tone={kite?.state === "ready" || kite?.state === "mock_mode" ? "ok" : "caution"} />
                    Kite
                  </div>
                  <Badge
                    tone={
                      kite?.state === "ready" || kite?.state === "mock_mode"
                        ? "ok"
                        : "caution"
                    }
                  >
                    {kite ? humanize(kite.state) : "Unavailable"}
                  </Badge>
                </div>
                <dl className="mt-3 space-y-1.5 text-[11px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Adapter mode</dt>
                    <dd className="font-mono-num text-ink">{kite?.mode ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Execution</dt>
                    <dd className="text-ink">
                      {kite?.executionMode === "live"
                        ? "Live x402"
                        : "Simulated checkout"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Agent registered</dt>
                    <dd className="text-ink">
                      {kite?.agentRegistered === null || kite?.agentRegistered === undefined
                        ? "Unknown"
                        : kite.agentRegistered
                          ? "Yes"
                          : "No"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-[11px] leading-5 text-ink-muted">
                  {kite?.note ??
                    "Kite status could not be read. No payment can be requested without a live session."}
                </p>
              </div>
            </div>
            <div className="border-t border-line bg-surface px-5 py-3">
              <Link
                href="/app/integrations"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-strong"
              >
                Integration details
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Upcoming renewals"
              description="Fixed dates only. A month-to-month service has no renewal cliff."
            />
            {upcoming.length === 0 ? (
              <div className="px-5 py-5">
                <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-4 py-3">
                  <CheckCircle2 className="mt-0.5 size-4 text-ok" />
                  <p className="text-[12px] leading-5 text-ink-muted">
                    Both active services are month-to-month. No promotion expiry or
                    fixed contract end date is recorded.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((item) => (
                  <li key={`${item.commitment.id}-${item.date}`} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="text-ink">{item.label}</span>
                      <span className="font-mono-num text-ink-muted">
                        {formatDate(item.date)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">
                      {item.commitment.providerName} — {item.commitment.planName}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recent activity" />
            <ul className="divide-y divide-line">
              {data.auditEvents.slice(0, 5).map((event) => (
                <li key={event.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[12px] leading-5 text-ink">
                      {humanize(event.eventType.replaceAll(".", " "))}
                    </div>
                    <span className="shrink-0 text-[10px] text-ink-faint">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-faint">
                    {humanize(event.entityType)} · {event.actorType}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {serv && !serv.configured ? (
            <InlineNotice tone="caution" title="SERV is not configured">
              Intent extraction will fail closed. The app will not silently fall
              back to the demo parser when SERV is expected but unavailable.
            </InlineNotice>
          ) : null}
          {kite && kite.executionMode === "simulated" ? (
            <InlineNotice tone="info" title="Simulated checkout">
              Kite session requests are real where configured; the payment step is
              simulated. No provider activation is claimed.
            </InlineNotice>
          ) : null}
          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink-muted">
              <CircleAlert className="size-3.5 text-caution" />
              No fake live data
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
              Provider names and terms are {demoLabels.illustrative.toLowerCase()}.
              Payment state is reported exactly as the adapter returns it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
