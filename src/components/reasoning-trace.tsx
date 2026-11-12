import type { ReasoningTrace, TraceStageStatus } from "@/lib/domain/trace";
import { Badge, Panel, PanelHeader } from "./ui";

const statusTone: Record<
  TraceStageStatus,
  "ok" | "danger" | "caution" | "neutral"
> = {
  passed: "ok",
  failed: "danger",
  unknown: "caution",
  not_instrumented: "neutral",
};

const statusLabel: Record<TraceStageStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  unknown: "Unknown",
  not_instrumented: "Not instrumented",
};

function sourceLabel(source: ReasoningTrace["stages"][number]["source"]): string {
  switch (source) {
    case "serv":
      return "SERV";
    case "engine":
      return "Engine";
    case "policy":
      return "Policy";
    case "demo_fixture":
      return "Demo fixture";
  }
}

export function ReasoningTracePanel({ trace }: { trace: ReasoningTrace }) {
  return (
    <Panel id="reasoning-trace" className="overflow-hidden scroll-mt-6">
      <PanelHeader
        title="Reasoning trace"
        description="What actually ran, in order, with recorded identifiers and timings. The model extracts; the engine decides."
        action={
          <Badge tone={trace.demoFixture ? "caution" : "ok"}>
            {trace.demoFixture ? "DEMO FIXTURE" : "Recorded"}
          </Badge>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-5 py-2.5 font-mono-num text-[10px] text-ink-faint">
        <span>correlation {trace.correlationId}</span>
        <span>{trace.stages.length} stages</span>
      </div>
      <ol className="divide-y divide-line">
        {trace.stages.map((stage, index) => (
          <li key={stage.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-3 hover:bg-surface">
                <span className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-ink">
                      {stage.label}
                    </span>
                    <span className="font-mono-num text-[9px] uppercase tracking-wider text-ink-faint">
                      {sourceLabel(stage.source)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-ink-muted">
                    {stage.summary}
                  </span>
                </span>
                <span className="mt-0.5 flex shrink-0 items-center gap-2">
                  {stage.durationMs !== null ? (
                    <span className="font-mono-num text-[10px] text-ink-faint">
                      {stage.durationMs} ms
                    </span>
                  ) : null}
                  <Badge tone={statusTone[stage.status]}>
                    {statusLabel[stage.status]}
                  </Badge>
                </span>
              </summary>
              <div className="border-t border-line bg-surface px-5 py-3">
                <dl className="grid gap-x-6 gap-y-1 text-[10px] sm:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Schema</dt>
                    <dd className="font-mono-num text-ink-muted">
                      {stage.schemaVersion}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Correlation</dt>
                    <dd className="truncate font-mono-num text-ink-muted">
                      {stage.correlationId ?? "not recorded"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Duration</dt>
                    <dd className="font-mono-num text-ink-muted">
                      {stage.durationMs === null
                        ? "not instrumented"
                        : `${stage.durationMs} ms (recorded)`}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-faint">Source</dt>
                    <dd className="font-mono-num text-ink-muted">
                      {sourceLabel(stage.source)}
                    </dd>
                  </div>
                </dl>
                {stage.detail.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {stage.detail.map((line) => (
                      <li
                        key={line}
                        className="text-[10px] leading-4 text-ink-muted"
                      >
                        — {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ol>

      <details className="group border-t border-line">
        <summary className="cursor-pointer list-none px-5 py-3 text-[11px] font-medium text-accent hover:text-accent-strong">
          Failure handling — what happens when SERV or a quote fails
        </summary>
        <ul className="divide-y divide-line border-t border-line">
          {trace.failureHandling.map((item) => (
            <li key={item.condition} className="px-5 py-2.5">
              <div className="text-[11px] font-medium text-ink">{item.condition}</div>
              <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">
                {item.outcome}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}
