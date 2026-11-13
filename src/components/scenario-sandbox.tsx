"use client";

import { useState } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { Badge, DecisionBadge, InlineNotice, Money, Panel, PanelHeader } from "./ui";
import { buttonClass } from "./button";
import { decimalToMinor, minorToDecimal } from "@/lib/domain/money";
import type { ScenarioEvaluation, ScenarioOutcome } from "@/lib/domain/scenario";

function errorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

function inputToMinor(value: string, currency: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return decimalToMinor(trimmed, currency);
}

function minorToInput(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return "";
  return minorToDecimal(value, currency);
}

function decisionTone(
  decision: ScenarioOutcome["decision"],
): "ok" | "caution" | "danger" {
  return decision === "allow" ? "ok" : decision === "review" ? "caution" : "danger";
}

export interface ScenarioDefaults {
  maxContractMonths: number | null;
  minimumMonthlySavingMinor: number | null;
  maxOneTimeFeeMinor: number | null;
  familyDiscountRetained: boolean | null;
}

export function ScenarioSandbox({
  analysisId,
  currency,
  defaults,
  base,
  familyDiscountExcluded,
}: {
  analysisId: string;
  currency: string;
  defaults: ScenarioDefaults;
  base: ScenarioOutcome;
  familyDiscountExcluded: boolean;
}) {
  const [maxContractMonths, setMaxContractMonths] = useState(
    defaults.maxContractMonths === null ? "" : String(defaults.maxContractMonths),
  );
  const [minSaving, setMinSaving] = useState(
    minorToInput(defaults.minimumMonthlySavingMinor, currency),
  );
  const [oneOffLimit, setOneOffLimit] = useState(
    minorToInput(defaults.maxOneTimeFeeMinor, currency),
  );
  const [discount, setDiscount] = useState<"asis" | "retained" | "lost">("asis");
  const [result, setResult] = useState<ScenarioEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMaxContractMonths(
      defaults.maxContractMonths === null ? "" : String(defaults.maxContractMonths),
    );
    setMinSaving(minorToInput(defaults.minimumMonthlySavingMinor, currency));
    setOneOffLimit(minorToInput(defaults.maxOneTimeFeeMinor, currency));
    setDiscount("asis");
    setResult(null);
    setError(null);
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const months = maxContractMonths.trim();
      const overrides: Record<string, number | boolean | null> = {
        maxContractMonths: months ? Number(months) : null,
        minimumMonthlySavingMinor: inputToMinor(minSaving, currency),
        maxOneTimeFeeMinor: inputToMinor(oneOffLimit, currency),
      };
      if (discount !== "asis") {
        overrides.retainFamilyDiscount = discount === "retained";
      }
      if (
        overrides.maxContractMonths !== null &&
        (!Number.isInteger(overrides.maxContractMonths) ||
          (overrides.maxContractMonths as number) <= 0)
      ) {
        throw new Error("Contract length must be a whole number of months.");
      }
      const response = await fetch(`/api/analyses/${analysisId}/scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          errorMessage(payload, "The scenario could not be evaluated."),
        );
      }
      setResult(payload as ScenarioEvaluation);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The scenario could not be evaluated.",
      );
    } finally {
      setBusy(false);
    }
  }

  const shown = result?.scenario ?? null;

  return (
    <Panel id="scenario" className="overflow-hidden scroll-mt-6">
      <PanelHeader
        title="Scenario sandbox — re-run the engine"
        description="Change the household limits, or assume the provider keeps the family discount, and the deterministic engine recomputes the decision. Nothing is saved."
        action={<Badge tone="neutral">What-if</Badge>}
      />
      <div className="grid gap-4 border-b border-line px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            Max contract length
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={120}
              value={maxContractMonths}
              onChange={(event) => setMaxContractMonths(event.target.value)}
              placeholder="no limit"
              className="w-full rounded-control border border-line bg-raised px-2.5 py-1.5 font-mono-num text-[12px] text-ink outline-none focus:border-accent"
            />
            <span className="text-[10px] text-ink-faint">months</span>
          </div>
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            Minimum monthly saving
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={minorToDecimal(1, currency)}
              value={minSaving}
              onChange={(event) => setMinSaving(event.target.value)}
              placeholder="none"
              className="w-full rounded-control border border-line bg-raised px-2.5 py-1.5 font-mono-num text-[12px] text-ink outline-none focus:border-accent"
            />
            <span className="text-[10px] text-ink-faint">{currency}</span>
          </div>
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            One-off fee limit
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={minorToDecimal(1, currency)}
              value={oneOffLimit}
              onChange={(event) => setOneOffLimit(event.target.value)}
              placeholder="no limit"
              className="w-full rounded-control border border-line bg-raised px-2.5 py-1.5 font-mono-num text-[12px] text-ink outline-none focus:border-accent"
            />
            <span className="text-[10px] text-ink-faint">{currency}</span>
          </div>
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            Family discount
          </span>
          <select
            value={familyDiscountExcluded ? "asis" : discount}
            onChange={(event) =>
              setDiscount(event.target.value as "asis" | "retained" | "lost")
            }
            disabled={familyDiscountExcluded}
            className="mt-1 w-full rounded-control border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="asis">As offered</option>
            <option value="retained">Assume retained</option>
            <option value="lost">Assume lost</option>
          </select>
          {familyDiscountExcluded ? (
            <span className="mt-1 block text-[9px] leading-4 text-caution">
              This document explicitly excludes the discount; a hypothetical flag
              cannot override it.
            </span>
          ) : null}
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="text-[10px] leading-4 text-ink-faint">
          The engine reads the same ledger snapshot. SERV is not called and no
          explanation is generated.
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className={buttonClass("quiet")}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className={buttonClass("primary")}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {busy ? "Evaluating…" : "Run scenario"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-line px-5 py-4">
          <InlineNotice tone="danger" title="Scenario failed">
            {error}
          </InlineNotice>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[12px]">
          <thead className="bg-surface text-[10px] text-ink-faint">
            <tr>
              <th className="px-5 py-2 font-medium">Outcome</th>
              <th className="px-4 py-2 font-medium">Recorded analysis</th>
              <th className="px-5 py-2 font-medium">
                {result ? "Scenario" : "Scenario (run to evaluate)"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="px-5 py-2.5 text-ink-muted">Decision</td>
              <td className="px-4 py-2.5">
                <DecisionBadge decision={base.decision} />
              </td>
              <td className="px-5 py-2.5">
                {shown ? (
                  <DecisionBadge decision={shown.decision} />
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </td>
            </tr>
            <tr>
              <td className="px-5 py-2.5 text-ink-muted">Difference, 12 months</td>
              <td className="px-4 py-2.5">
                <Money minor={base.delta12Minor} currency={currency} unknownLabel="Incomplete" />
              </td>
              <td className="px-5 py-2.5">
                {shown ? (
                  <Money minor={shown.delta12Minor} currency={currency} unknownLabel="Incomplete" />
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </td>
            </tr>
            <tr>
              <td className="px-5 py-2.5 text-ink-muted">Difference, 24 months</td>
              <td className="px-4 py-2.5">
                <Money minor={base.delta24Minor} currency={currency} unknownLabel="Incomplete" />
              </td>
              <td className="px-5 py-2.5">
                {shown ? (
                  <Money minor={shown.delta24Minor} currency={currency} unknownLabel="Incomplete" />
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </td>
            </tr>
            <tr>
              <td className="px-5 py-2.5 text-ink-muted">Material unknowns</td>
              <td className="px-4 py-2.5 font-mono-num">{base.unknowns.length}</td>
              <td className="px-5 py-2.5 font-mono-num">
                {shown ? shown.unknowns.length : "—"}
              </td>
            </tr>
            <tr>
              <td className="px-5 py-2.5 text-ink-muted">Evidence quotes located</td>
              <td className="px-4 py-2.5 font-mono-num">
                {base.evidenceValid}/{base.evidenceTotal}
              </td>
              <td className="px-5 py-2.5 font-mono-num">
                {shown ? `${shown.evidenceValid}/${shown.evidenceTotal}` : "—"}
              </td>
            </tr>
            <tr>
              <td className="px-5 py-2.5 text-ink-muted">Cost model</td>
              <td className="px-4 py-2.5 font-mono-num text-[10px]">{base.costModel}</td>
              <td className="px-5 py-2.5 font-mono-num text-[10px]">
                {shown ? shown.costModel : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {result ? (
        <div className="border-t border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
              Decision moved
            </span>
            <Badge tone={decisionTone(result.base.decision)}>
              {result.base.decision.toUpperCase()}
            </Badge>
            <span className="text-ink-faint">→</span>
            <Badge tone={decisionTone(result.scenario.decision)}>
              {result.scenario.decision.toUpperCase()}
            </Badge>
            {result.scenario.decision === result.base.decision ? (
              <span className="text-[10px] text-ink-faint">
                (unchanged — the hypothetical terms do not change the verdict)
              </span>
            ) : null}
          </div>

          {result.appliedOverrides.length > 0 ? (
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-[10px] sm:grid-cols-2">
              {result.appliedOverrides.map((item) => (
                <div key={item.field} className="flex justify-between gap-3">
                  <dt className="text-ink-faint">{item.label}</dt>
                  <dd className="font-mono-num text-ink-muted">
                    {item.before} → {item.after}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {result.scenario.blockers.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {result.scenario.blockers.map((blocker) => (
                <li
                  key={blocker.code}
                  className="text-[10px] leading-4 text-ink-muted"
                >
                  <span className="font-mono-num text-danger">{blocker.code}</span>
                  {" — "}
                  {blocker.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[10px] text-ok">
              No high-severity constraint fires under this scenario.
            </p>
          )}

          <p className="mt-3 border-t border-line pt-2 text-[10px] leading-4 text-ink-faint">
            {result.disclaimer} A shadow scenario is a planning tool, not a decision
            of record.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
