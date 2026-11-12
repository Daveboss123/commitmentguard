import Link from "next/link";
import type { Metadata } from "next";
import {
  Check,
  FileCheck2,
  GitCompareArrows,
  LockKeyhole,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge, DecisionBadge, InlineNotice, Money, MoneyDelta, Panel } from "@/components/ui";
import { CostBreakdown } from "@/components/cost-breakdown";
import { buttonClass } from "@/components/button";
import { brand } from "@/lib/brand";
import { formatMoneyMinor } from "@/lib/domain/money";
import { buildAnalysis } from "@/lib/domain/decision";
import { runBenchmark } from "@/lib/benchmark/runner";
import { humanize } from "@/lib/format";
import {
  benefits,
  commitments,
  currentEvidence,
  dependencies,
  documents,
  offers,
  policy,
} from "@/lib/fixtures/demo";
import { demoIntent } from "@/lib/fixtures/demo-intent";
import { formatPercent } from "@/lib/format";

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.description,
};

const offerA = offers[0];

const decisionRecord = buildAnalysis({
  householdId: demoIntent.householdId,
  intent: demoIntent,
  policy,
  offer: offerA,
  commitments,
  benefits,
  dependencies,
  currentEvidence,
  documents,
});

const benchmark = runBenchmark();

export default function LandingPage() {
  const current24 = decisionRecord.totals.current24.totalMinor;
  const proposed24 = decisionRecord.totals.proposed24.totalMinor;
  const delta24 = decisionRecord.totals.delta24Minor;
  const delta24AbsLabel = formatMoneyMinor(
    delta24 === null ? null : Math.abs(delta24),
    "USD",
    "en-US",
    { maximumFractionDigits: 0 },
  );
  const topReasons = decisionRecord.decisionReasons.slice(0, 3);
  const materialConsequences = decisionRecord.consequences
    .filter((item) => item.direction !== "neutral")
    .slice(0, 4);
  const sampleEvidence = offerA.evidence.slice(0, 2);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-6 text-[13px] text-ink-muted md:flex">
            <a href="#how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="#decision-record" className="hover:text-ink">
              Decision record
            </a>
            <a href="#benchmark" className="hover:text-ink">
              Benchmark
            </a>
          </nav>
          <Link href="/login" className={buttonClass("primary")}>
            Open the demo
          </Link>
        </div>
      </header>

      <main>
        <section className="paper-grid border-b border-line">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-20 lg:pt-16">
            <div className="max-w-[620px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1 text-[12px] text-ink-muted">
                <span className="size-1.5 rounded-full bg-accent" />
                Commitment consequence engine for household agents
              </div>
              <h1 className="mt-6 font-display text-[46px] leading-[0.98] tracking-[-0.03em] text-ink sm:text-[62px]">
                Understand the consequence before you consent.
              </h1>
              <p className="mt-5 max-w-[58ch] text-[16px] leading-7 text-ink-muted">
                {brand.name} sits between an AI assistant and a household
                commitment. It reads the terms, proves every quoted fact, prices
                the full contract, checks the household&apos;s own rules, and only
                then asks for consent — bound to the exact offer version.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/login" className={buttonClass("primary")}>
                  Open the demo workspace
                </Link>
                <a href="#decision-record" className={buttonClass("secondary")}>
                  See a live decision record
                </a>
              </div>
              <p className="mt-5 text-[12px] leading-5 text-ink-faint">
                Demo household and illustrative provider terms. No real payment
                is made and no provider activation is claimed.
              </p>

              <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-4">
                {[
                  ["30", "hand-authored cases"],
                  [formatPercent(benchmark.metrics.decisionAccuracy), "decision accuracy"],
                  [formatPercent(benchmark.metrics.hardConstraintBlockRate), "hard-constraint block rate"],
                  [formatPercent(benchmark.metrics.falseBlockRate), "false blocks"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="text-[11px] leading-4 text-ink-faint">{label}</dt>
                    <dd className="mt-1 font-display text-[24px] leading-none text-ink">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div id="decision-record" className="lg:pt-2">
              <Panel tone="raised" className="overflow-hidden">
                <div className="border-b border-line bg-surface px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-ink-faint">Decision record</div>
                      <div className="mt-1 font-display text-[20px] leading-tight text-ink">
                        {offerA.providerName} — {offerA.planName}
                      </div>
                    </div>
                    <DecisionBadge decision={decisionRecord.decision} size="large" />
                  </div>
                  <div className="mt-2 text-[11px] text-ink-faint">
                    {offerA.sourceLabel} · offer version {offerA.offerVersion}
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
                  <div className="px-5 py-4">
                    <div className="text-[11px] text-ink-faint">
                      24-month household cost
                    </div>
                    <div className="mt-1.5 font-display text-[27px] leading-none text-ink">
                      <Money minor={proposed24} />
                    </div>
                    <div className="mt-1.5 text-[11px] text-ink-faint">
                      Current: <Money minor={current24} />
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <div className="text-[11px] text-ink-faint">Cost change</div>
                    <div className="mt-1.5 font-display text-[27px] leading-none text-danger">
                      <MoneyDelta minor={delta24} />
                    </div>
                    <div className="mt-1.5 text-[11px] text-ink-faint">
                      Full 24-month delta, including fees and the lost discount
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="text-[11px] font-medium text-ink-muted">
                    Why it is blocked
                  </div>
                  <ul className="mt-3 space-y-2.5">
                    {topReasons.map((reason) => (
                      <li key={reason.code} className="flex gap-2.5">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" />
                        <div>
                          <div className="text-[13px] font-medium leading-5 text-ink">
                            {reason.title}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ink-muted">
                            {reason.detail}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 text-[11px] text-ink-faint">
                  <span className="inline-flex items-center gap-1.5">
                    <LockKeyhole className="size-3.5" />
                    Deterministic engine. No LLM vote.
                  </span>
                  <Link href="/login" className="font-medium text-accent hover:text-accent-strong">
                    Open record
                  </Link>
                </div>
              </Panel>
              <p className="mt-3 px-1 text-[11px] leading-4 text-ink-faint">
                Computed from the demo fixtures with the same engine the app runs.
                The advertised price is real; the total cost is the point.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-[1180px] gap-6 px-5 py-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            {[
              {
                icon: ScanSearch,
                title: "Reads the whole offer",
                body: "Promo end date, standard price, one-off fees, contract term and cancellation cost — quoted from the document, not guessed.",
              },
              {
                icon: GitCompareArrows,
                title: "Prices the dependency",
                body: "A household discount that depends on the current provider is a real monthly cost when the switch breaks it.",
              },
              {
                icon: ShieldCheck,
                title: "Checks your rules",
                body: "Saving floor, maximum term, benefits to keep and unknowns you refuse to accept. Hard constraints never bend.",
              },
              {
                icon: FileCheck2,
                title: "Leaves a verifiable trail",
                body: "Approval is bound to the offer version. A simulated Kite payment is capped. The receipt hash chain can be rechecked.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-accent">
                  <Icon className="size-4" />
                </span>
                <div>
                  <div className="text-[13px] font-medium text-ink">{title}</div>
                  <p className="mt-1 text-[12px] leading-5 text-ink-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
          <div className="max-w-[680px]">
            <div className="text-[12px] font-medium text-accent">How it works</div>
            <h2 className="mt-3 font-display text-[36px] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[42px]">
              The assistant proposes. The engine decides.
            </h2>
            <p className="mt-3 text-[14px] leading-6 text-ink-muted">
              SERV Reasoning turns the household&apos;s plain-English request and
              the provider document into structured constraints and terms. The
              deterministic engine does the money and policy work. A language
              model never chooses allow, review or block.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "01",
                title: "Request",
                body: "“Save at least $10 a month. Keep the family benefit. No contract over 12 months.”",
              },
              {
                step: "02",
                title: "Extract and confirm",
                body: "SERV proposes a structured intent contract. The household confirms it before any analysis runs.",
              },
              {
                step: "03",
                title: "Analyse every consequence",
                body: "Full 12- and 24-month cost, lost benefits, term, fees, unknowns and evidence validity — per offer.",
              },
              {
                step: "04",
                title: "Consent, pay, receipt",
                body: "Approve the exact consequences. A capped Kite session is requested. The receipt is hashed and independently recheckable.",
              },
            ].map((item) => (
              <Panel key={item.step} className="p-5">
                <div className="font-mono-num text-[12px] text-accent">{item.step}</div>
                <div className="mt-3 font-display text-[21px] leading-tight text-ink">
                  {item.title}
                </div>
                <p className="mt-2 text-[12px] leading-5 text-ink-muted">{item.body}</p>
              </Panel>
            ))}
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
            <div>
              <div className="text-[12px] font-medium text-accent">The consequence gap</div>
              <h2 className="mt-3 font-display text-[34px] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[40px]">
                $30 a month can cost {delta24AbsLabel} more over 24 months.
              </h2>
              <p className="mt-4 max-w-[58ch] text-[14px] leading-6 text-ink-muted">
                Offer A advertises $30.00 for six months, then $55.00 a month.
                Add the $70.00 installation fee, $5.00 a month for equipment, the
                $60.00 mobile bill the household still pays, and the $20.00 monthly
                family discount the switch destroys. Over 24 months that is{" "}
                <Money minor={proposed24} /> against <Money minor={current24} /> today
                — a{" "}
                <MoneyDelta minor={delta24} /> increase. The 24-month term also
                conflicts with the household&apos;s 12-month limit.
              </p>

              <div className="mt-7 overflow-hidden rounded-xl border border-line bg-raised">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-line bg-paper text-[11px] text-ink-faint">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Cost over the term</th>
                      <th className="px-4 py-2.5 text-right font-medium">Current</th>
                      <th className="px-4 py-2.5 text-right font-medium">Offer A</th>
                      <th className="px-4 py-2.5 text-right font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    <tr>
                      <td className="px-4 py-3 text-ink-muted">12 months</td>
                      <td className="px-4 py-3 text-right">
                        <Money minor={decisionRecord.totals.current12.totalMinor} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Money minor={decisionRecord.totals.proposed12.totalMinor} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MoneyDelta minor={decisionRecord.totals.delta12Minor} />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-ink-muted">24 months</td>
                      <td className="px-4 py-3 text-right">
                        <Money minor={current24} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Money minor={proposed24} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MoneyDelta minor={delta24} />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-ink-muted">Minimum term</td>
                      <td className="px-4 py-3 text-right font-mono-num">Month to month</td>
                      <td className="px-4 py-3 text-right font-mono-num text-danger">
                        24 months
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-danger">
                        +24 months
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-ink-muted">Family discount</td>
                      <td className="px-4 py-3 text-right font-mono-num">Retained</td>
                      <td className="px-4 py-3 text-right font-mono-num text-danger">Lost</td>
                      <td className="px-4 py-3 text-right font-mono-num text-danger">
                        −$20.00/mo
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-3 space-y-3">
                <CostBreakdown
                  title="Current household — 24-month line items"
                  description="Every included cost and retained benefit, in integer minor units."
                  tco={decisionRecord.totals.current24}
                />
                <CostBreakdown
                  title="Offer A — 24-month line items"
                  description="The advertised price is only one row. Fees, the unchanged mobile bill and the lost discount are the rest."
                  tco={decisionRecord.totals.proposed24}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="danger">Hard constraint: maximum 12 months</Badge>
                <Badge tone="danger">Lost benefit: $20.00/month</Badge>
                <Badge tone="caution">Advertised price is misleading, not illegal</Badge>
              </div>
            </div>

            <div>
              <Panel tone="raised" className="overflow-hidden">
                <div className="border-b border-line px-5 py-4">
                  <h3 className="font-display text-[20px] leading-tight text-ink">
                    What else changes
                  </h3>
                  <p className="mt-1 text-[12px] leading-5 text-ink-muted">
                    Material consequences, not a summary of the sales page.
                  </p>
                </div>
                <ul className="divide-y divide-line">
                  {materialConsequences.map((item) => (
                    <li key={item.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-[13px] font-medium leading-5 text-ink">
                          {item.title}
                        </div>
                        <Badge
                          tone={
                            item.severity === "critical" || item.severity === "high"
                              ? "danger"
                              : item.severity === "medium"
                                ? "caution"
                                : "neutral"
                          }
                        >
                          {item.severity}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">
                        {item.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="text-[12px] font-medium text-accent">Evidence, not vibes</div>
              <h2 className="mt-3 font-display text-[34px] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[40px]">
                Every material fact carries its own receipt.
              </h2>
              <p className="mt-4 max-w-[54ch] text-[14px] leading-6 text-ink-muted">
                If a quote is not in the source document, the fact is not verified.
                If two sources disagree on the same field, the analysis is blocked.
                If a material term is missing, the total is shown as unknown — never
                as zero.
              </p>
              <div className="mt-6 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
                  <Check className="size-4 text-accent" />
                  Evidence quote validity
                </div>
                <div className="mt-2 font-display text-[30px] leading-none text-ink">
                  {formatPercent(benchmark.metrics.evidenceQuoteValidity)}
                </div>
                <div className="mt-1 text-[11px] leading-4 text-ink-faint">
                  {benchmark.metrics.totalCases} benchmark cases. One intentionally
                  corrupted quote is caught, not excused.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {sampleEvidence.map((item) => (
                <Panel key={item.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] text-ink-faint">
                      {item.sourceLabel} · {item.normalizedField}
                    </div>
                    <Badge tone={item.status === "verified" ? "ok" : "caution"}>
                      {humanize(item.status)}
                    </Badge>
                  </div>
                  <blockquote className="mt-2 border-l-2 border-accent/40 pl-3 text-[13px] leading-6 text-ink">
                    “{item.quote}”
                  </blockquote>
                  <div className="mt-2 font-mono-num text-[10px] text-ink-faint">
                    source hash {item.sourceVersionHash.slice(0, 18)}…
                  </div>
                </Panel>
              ))}
              <InlineNotice tone="neutral">
                <span className="font-medium">The rule:</span> a model may extract
                and explain. It may not decide. The allow/review/block decision is
                computed from integer money, stated terms and the household&apos;s
                confirmed policy.
              </InlineNotice>
            </div>
          </div>
        </section>

        <section id="benchmark" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div className="max-w-[620px]">
                <div className="text-[12px] font-medium text-accent">Measured, not asserted</div>
                <h2 className="mt-3 font-display text-[34px] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[40px]">
                  30 fixed cases. Two weaker baselines. The same engine.
                </h2>
                <p className="mt-3 text-[14px] leading-6 text-ink-muted">
                  Every label is hand-authored before the run. The benchmark does
                  not call SERV and does not use an LLM as a judge.
                </p>
              </div>
              <Link href="/login" className={buttonClass("secondary")}>
                Open the full benchmark
              </Link>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  label: "Cases passed",
                  value: `${benchmark.metrics.passedCases}/${benchmark.metrics.totalCases}`,
                  detail: "fixed hand-authored labels",
                },
                {
                  label: "Decision accuracy",
                  value: formatPercent(benchmark.metrics.decisionAccuracy),
                  detail: `${benchmark.ratios.decisionAccuracy.numerator}/${benchmark.ratios.decisionAccuracy.denominator} cases`,
                },
                {
                  label: "Hard-constraint block rate",
                  value: formatPercent(benchmark.metrics.hardConstraintBlockRate),
                  detail: `${benchmark.ratios.hardConstraintBlockRate.numerator}/${benchmark.ratios.hardConstraintBlockRate.denominator} block cases`,
                },
                {
                  label: "Material consequence recall",
                  value: formatPercent(benchmark.metrics.materialConsequenceRecall),
                  detail: `${benchmark.ratios.materialConsequenceRecall.numerator}/${benchmark.ratios.materialConsequenceRecall.denominator} keywords`,
                },
                {
                  label: "False-block rate",
                  value: formatPercent(benchmark.metrics.falseBlockRate),
                  detail: `${benchmark.ratios.falseBlockRate.numerator}/${benchmark.ratios.falseBlockRate.denominator} allow cases`,
                },
              ].map((metric) => (
                <div key={metric.label} className="bg-raised px-5 py-5">
                  <div className="text-[11px] leading-4 text-ink-faint">{metric.label}</div>
                  <div className="mt-2 font-mono-num tabular text-[24px] leading-none text-ink">
                    {metric.value}
                  </div>
                  <div className="mt-1.5 font-mono-num text-[9px] text-ink-faint">
                    {metric.detail}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {benchmark.baselines.map((baseline) => (
                <div
                  key={baseline.name}
                  className="flex items-center justify-between gap-4 rounded-xl border border-line bg-raised px-4 py-3"
                >
                  <div>
                    <div className="text-[12px] font-medium text-ink">{baseline.name}</div>
                    <div className="mt-0.5 text-[11px] text-ink-faint">
                      {baseline.description}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono-num text-[16px] text-danger">
                      {formatPercent(baseline.hardConstraintEscapeRate)}
                    </div>
                    <div className="text-[10px] text-ink-faint">hard-constraint escape</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-4 text-ink-faint">
              Baselines are controlled experimental comparisons, not claims about a
              real product. Full per-case results are in the app.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <div className="text-[12px] font-medium text-accent">Fail closed</div>
              <h2 className="mt-3 font-display text-[34px] leading-[1.05] tracking-[-0.02em] text-ink sm:text-[40px]">
                The safe answer is often “no”.
              </h2>
              <p className="mt-4 max-w-[54ch] text-[14px] leading-6 text-ink-muted">
                {brand.name} refuses to proceed when the evidence, the offer
                version or the payment session cannot be trusted. A refused action
                is a product outcome, not an error to paper over.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                "An unverifiable quote invalidates the fact",
                "Conflicting values for the same field block the offer",
                "Unknown critical terms are never priced as zero",
                "Changing the offer invalidates the approval",
                "Expired or over-budget Kite sessions cannot execute",
                "A submitted payment cannot be executed twice",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[12px] leading-5 text-ink"
                >
                  <LockKeyhole className="mt-0.5 size-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-line bg-accent-strong text-raised">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-end justify-between gap-6 px-5 py-14 sm:px-8">
            <div className="max-w-[620px]">
              <h2 className="font-display text-[34px] leading-[1.05] tracking-[-0.02em] sm:text-[40px]">
                Ready to see the consequence?
              </h2>
              <p className="mt-3 text-[14px] leading-6 text-raised/75">
                The demo starts with the Morgan household, three illustrative
                broadband offers, and a request that sounds reasonable until the
                full cost is on the table.
              </p>
            </div>
            <Link
              href="/login"
              className={buttonClass(
                "secondary",
                "border-raised/30 bg-raised text-accent-strong hover:bg-white",
              )}
            >
              Enter the demo workspace
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-paper">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-[11px] text-ink-faint sm:px-8">
          <span>
            {brand.name} · {brand.workingNameNote}
          </span>
          <span>
            Demo provider · Illustrative terms · Simulated checkout — no real
            payment is made
          </span>
        </div>
      </footer>
    </div>
  );
}
