import type { TcoResult } from "@/lib/domain/types";
import { Badge, Money, Panel, PanelHeader } from "./ui";

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
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[11px] font-medium text-accent hover:text-accent-strong">
          <span>{defaultOpen ? "Line items" : "Show the arithmetic for every line"}</span>
          <span className="font-mono-num text-[10px] text-ink-faint group-open:hidden">
            {included.length} lines
          </span>
        </summary>

        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[620px] text-left text-[12px]">
            <thead className="bg-surface text-[10px] text-ink-faint">
              <tr>
                <th className="px-5 py-2 font-medium">Line item</th>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Arithmetic</th>
                <th className="px-5 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {included.map((line) => (
                <tr key={line.id} className="align-top">
                  <td className="px-5 py-2.5">
                    <div className="text-ink">{line.label}</div>
                    <div className="mt-0.5 font-mono-num text-[9px] text-ink-faint">
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
