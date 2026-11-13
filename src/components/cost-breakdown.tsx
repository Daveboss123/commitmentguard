import type { TcoResult } from "@/lib/domain/types";
import { Badge, Money, Panel, PanelHeader } from "./ui";
import { ChevronDown } from "lucide-react";

function periodLabel(tco: TcoResult, line: TcoResult["lines"][number]): string {
  if (line.frequency === "one_off") return "one-off";
  if (line.startMonth === null || line.endMonth === null) {
    return `${line.quantity} mo`;
  }
  if (line.startMonth === 1 && line.endMonth === line.quantity) {
    return `${line.quantity} mo`;
  }
  return `mo ${line.startMonth}–${line.endMonth}`;
}

/**
 * An auditable total. Every row is a real line item with its own arithmetic,
 * source evidence reference and month range. The footer checks that the rows
 * add up to the reported total, so the display cannot drift from the engine.
 */
export function CostBreakdown({
  title,
  description,
  tco,
  defaultOpen = false,
  className,
}: {
  title: string;
  description?: string;
  tco: TcoResult;
  defaultOpen?: boolean;
  className?: string;
}) {
  const lines = tco.lines ?? [];
  const included = lines.filter((line) => line.includedInTotal);
  const summed = included.reduce((total, line) => total + line.subtotalMinor, 0);
  const reconciles = tco.totalMinor !== null && summed === tco.totalMinor;

  return (
    <Panel className={className ?? "overflow-hidden"}>
      <PanelHeader
        title={title}
        description={description}
        action={
          <Badge tone={tco.complete ? (reconciles ? "ok" : "danger") : "caution"}>
            {tco.complete
              ? reconciles
                ? `${included.length} lines reconcile`
                : "Line items do not reconcile"
              : `${tco.missingFields.length} unknown term${
                  tco.missingFields.length === 1 ? "" : "s"
                }`}
          </Badge>
        }
      />
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-3">
        <span className="text-[11px] text-ink-faint">
          {tco.horizonMonths}-month horizon · cost model {tco.calculationVersion ?? "unrecorded"}
        </span>
        <span className="font-mono-num text-[18px] leading-none text-ink">
          <Money minor={tco.totalMinor} unknownLabel="Incomplete" />
        </span>
      </div>

      <details open={defaultOpen} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13px] font-medium text-accent hover:text-accent-strong">
          <span>{defaultOpen ? "Line items" : "Show every calculation"}</span>
          <span className="flex items-center gap-2 font-mono-num text-[11px] text-ink-faint">
            {included.length} lines <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>

        <div className="@container border-t border-line">
          <ul className="divide-y divide-line @min-[38rem]:hidden">
            {included.map((line) => (
              <li key={line.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[13px] font-medium text-ink">{line.label}</p><p className="mt-1 text-[11px] text-ink-muted">{periodLabel(tco, line)}</p></div>
                  <span className={line.direction === "saving" ? "font-mono-num text-ok" : "font-mono-num text-ink"}><Money minor={line.subtotalMinor} currency={line.currency} /></span>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-ink-muted">{line.calculationExplanation}</p>
                {line.sourceEvidenceId ? <a href={`#evidence-${line.sourceEvidenceId}`} className="mt-2 inline-flex min-h-11 items-center text-[11px] text-accent">Open source fact</a> : <p className="mt-2 text-[11px] text-ink-faint">No document evidence attached</p>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto @min-[38rem]:block">
          <table className="w-full min-w-[620px] text-left text-[12px]">
            <caption className="sr-only">Cost lines and the arithmetic that produces this total</caption>
            <thead className="bg-surface text-[10px] text-ink-faint">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">Line item</th>
                <th scope="col" className="px-3 py-2 font-medium">Period</th>
                <th scope="col" className="px-3 py-2 font-medium">Arithmetic</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {included.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="px-5 py-2.5">
                    <div className="text-ink">{line.label}</div>
                    <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                      {line.id}
                      {line.sourceEvidenceId ? ` · ${line.sourceEvidenceId}` : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono-num text-[10px] text-ink-muted">
                    {periodLabel(tco, line)}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] leading-4 text-ink-muted">
                    {line.calculationExplanation}
                  </td>
                  <td
                    className={
                      line.direction === "saving"
                        ? "whitespace-nowrap px-5 py-2.5 text-right font-mono-num text-ok"
                        : "whitespace-nowrap px-5 py-2.5 text-right font-mono-num text-ink"
                    }
                  >
                    <Money minor={line.subtotalMinor} currency={line.currency} />
                  </td>
                </tr>
              ))}
              {included.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-[11px] text-ink-muted">
                    No line items could be included.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot className="border-t border-line-strong bg-surface">
              <tr>
                <td colSpan={3} className="px-5 py-2 text-[11px] text-ink-muted">
                  Sum of line items
                  {tco.complete && reconciles ? " — matches the reported total" : ""}
                </td>
                <td className="px-5 py-2 text-right font-mono-num text-[12px] text-ink">
                  <Money minor={tco.complete ? summed : null} unknownLabel="Incomplete" />
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

        {tco.missingFields.length > 0 ? (
          <ul className="divide-y divide-line border-t border-line">
            {tco.missingFields.map((missing) => (
              <li
                key={missing}
                className="px-5 py-2 text-[10px] leading-4 text-caution"
              >
                Not priced: {missing}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </Panel>
  );
}
