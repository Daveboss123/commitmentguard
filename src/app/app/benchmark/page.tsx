import type { Metadata } from "next";
import { connection } from "next/server";
import {
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import {
  Badge,
  InlineNotice,
  PageHeader,
  Panel,
  PanelHeader,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { runBenchmark } from "@/lib/benchmark/runner";
import { formatDateTime, formatPercent, humanize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Benchmark",
};

export default async function BenchmarkPage() {
  // The benchmark mints analysis ids and timestamps while it runs, so it must
  // execute per request rather than being captured in a prerendered shell.
  await connection();
  const report = runBenchmark();
  const metrics = report.metrics;

  const metricsView: { label: string; value: string; detail?: string }[] = [
    {
      label: "Cases passed",
      value: `${metrics.passedCases}/${metrics.totalCases}`,
      detail: `Overall pass rate ${formatPercent(metrics.overallPassRate)}`,
    },
    {
      label: "Decision accuracy",
      value: formatPercent(metrics.decisionAccuracy),
      detail: "Allow / review / block versus the hand-authored label",
    },
    {
      label: "Hard-constraint block rate",
      value: formatPercent(metrics.hardConstraintBlockRate),
      detail: "Expected blocks that actually blocked",
    },
    {
      label: "False-block rate",
      value: formatPercent(metrics.falseBlockRate),
      detail: "Compliant offers blocked by mistake",
    },
    {
      label: "Material consequence recall",
      value: formatPercent(metrics.materialConsequenceRecall),
      detail: "Expected consequence keywords found",
    },
    {
      label: "TCO accuracy",
      value: formatPercent(metrics.tcoAccuracy),
      detail: "Four integer totals per case",
    },
    {
      label: "Evidence quote validity",
      value: formatPercent(metrics.evidenceQuoteValidity),
      detail: "Quotes located in their source",
    },
    {
      label: "Unknown handling",
      value: formatPercent(metrics.unknownHandlingAccuracy),
      detail: "Unknowns never priced as zero",
    },
    {
      label: "Human interruption rate",
      value: formatPercent(metrics.humanInterruptionRate),
      detail: "Cases not auto-allowed",
    },
    {
      label: "Approval required",
      value: formatPercent(metrics.approvalRequiredRate),
      detail: "Expected consent gates",
    },
    {
      label: "Payment allowed",
      value: formatPercent(metrics.paymentAllowedRate),
      detail: "Only after approval, never automatic",
    },
    {
      label: "Mean analysis latency",
      value: `${metrics.meanAnalysisLatencyMs} ms`,
      detail: "Deterministic engine only; no SERV call",
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Measured, not asserted"
        title="Benchmark"
        description={`${metrics.totalCases} fixed, hand-authored cases run against the same engine the app uses. Labels are written before the run. No LLM judge and no SERV call participate in this benchmark.`}
        actions={
          <ButtonLink href="/app/compare" variant="secondary">
            <ClipboardCheck className="size-4" />
            Run a real comparison
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <Gauge className="size-3.5" />
          Engine {report.engineVersion}
        </span>
        <span>Generated {formatDateTime(report.generatedAt)}</span>
        <Badge tone={metrics.overallPassRate === 1 ? "ok" : "caution"}>
          {metrics.overallPassRate === 1 ? "All labelled cases pass" : "Some cases fail"}
        </Badge>
      </div>

      <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {metricsView.map((item) => (
          <div key={item.label} className="bg-raised px-5 py-4">
            <div className="text-[11px] leading-4 text-ink-faint">{item.label}</div>
            <div className="mt-1.5 font-display text-[24px] leading-none text-ink">
              {item.value}
            </div>
            {item.detail ? (
              <div className="mt-1.5 text-[10px] leading-4 text-ink-faint">
                {item.detail}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="By category"
            description="Coverage is fixed by the case file, not sampled at runtime."
          />
          <ul className="divide-y divide-line">
            {report.categories.map((category) => (
              <li
                key={category.category}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div>
                  <div className="text-[12px] font-medium text-ink">
                    {category.label}
                  </div>
                  <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                    {category.category}
                  </div>
                </div>
                <Badge tone={category.passed === category.total ? "ok" : "danger"}>
                  {category.passed}/{category.total}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Weaker baselines"
            description="Controlled comparisons against simpler decision rules. These are not claims about a real product."
            action={<ShieldAlert className="size-4 text-ink-faint" />}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Baseline</th>
                  <th className="px-5 py-2.5 text-right font-medium">Decision accuracy</th>
                  <th className="px-5 py-2.5 text-right font-medium">Hard-constraint escape</th>
                  <th className="px-5 py-2.5 text-right font-medium">False block</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.baselines.map((baseline) => (
                  <tr key={baseline.name}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{baseline.name}</div>
                      <div className="mt-0.5 max-w-[320px] text-[10px] leading-4 text-ink-faint">
                        {baseline.description}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num">
                      {formatPercent(baseline.decisionAccuracy)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num text-danger">
                      {formatPercent(baseline.hardConstraintEscapeRate)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-num">
                      {formatPercent(baseline.falseBlockRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3">
            <p className="text-[10px] leading-4 text-ink-faint">
              The baselines deliberately use cheaper heuristics: advertised price
              versus current monthly spend, with no full term, dependency or evidence
              check.
            </p>
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Every case"
            description="Expected decision, actual decision, integer-total agreement and evidence integrity."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-[12px]">
              <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                <tr>
                  <th className="px-5 py-3 font-medium">Case</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Expected</th>
                  <th className="px-5 py-3 font-medium">Actual</th>
                  <th className="px-5 py-3 text-center font-medium">Totals</th>
                  <th className="px-5 py-3 text-center font-medium">Evidence</th>
                  <th className="px-5 py-3 text-center font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.cases.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-surface">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{item.title}</div>
                      <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                        {item.id}
                      </div>
                      <div className="mt-1 max-w-[360px] text-[10px] leading-4 text-ink-muted">
                        {item.note}
                      </div>
                      {item.consequenceMisses.length > 0 ? (
                        <div className="mt-1 text-[10px] text-danger">
                          Missed: {item.consequenceMisses.join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-[11px] text-ink-muted">
                      {humanize(item.category)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        tone={
                          item.expectedDecision === "allow"
                            ? "ok"
                            : item.expectedDecision === "review"
                              ? "caution"
                              : "danger"
                        }
                      >
                        {humanize(item.expectedDecision)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        tone={
                          item.actualDecision === "allow"
                            ? "ok"
                            : item.actualDecision === "review"
                              ? "caution"
                              : "danger"
                        }
                      >
                        {humanize(item.actualDecision)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {item.totalsMatch ? (
                        <CheckCircle2 className="mx-auto size-4 text-ok" />
                      ) : (
                        <XCircle className="mx-auto size-4 text-danger" />
                      )}
                    </td>
                    <td className="px-5 py-3 text-center font-mono-num text-[11px]">
                      <span
                        className={
                          item.actual.invalidEvidenceIds.length > 0 ||
                          item.actual.contradictedEvidenceIds.length > 0
                            ? "text-danger"
                            : "text-ink-muted"
                        }
                      >
                        {item.actual.evidenceValid}/{item.actual.evidenceTotal}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {item.passed ? (
                        <Badge tone="ok">Pass</Badge>
                      ) : (
                        <Badge tone="danger">Fail</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel className="overflow-hidden">
          <PanelHeader title="Method notes" />
          <ul className="divide-y divide-line">
            {report.notes.map((note) => (
              <li
                key={note}
                className="flex gap-2.5 px-5 py-3 text-[11px] leading-5 text-ink-muted"
              >
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" />
                {note}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6">
        <InlineNotice tone="info" title="What the benchmark does not measure">
          It does not measure SERV extraction quality, a real Kite transaction,
          provider activation, or production latency. Those are outside the
          deterministic engine and are reported honestly elsewhere in the app.
        </InlineNotice>
      </div>
    </div>
  );
}
