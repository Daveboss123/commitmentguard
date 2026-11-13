import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge, DecisionBadge, Money, MoneyDelta } from "./ui";
import { buttonClass } from "./button";
import { formatDate, humanize } from "@/lib/format";
import type { HouseholdData } from "@/lib/page/data";
import type { Analysis } from "@/lib/domain/types";

export function AnalysisHistory({ analyses, data }: {
  analyses: Analysis[];
  data: Pick<HouseholdData, "offers" | "intents" | "approvals" | "executions" | "household">;
}) {
  const offers = new Map(data.offers.map((item) => [item.id, item]));
  const intents = new Map(data.intents.map((item) => [item.id, item]));

  function context(analysis: Analysis) {
    const offer = offers.get(analysis.offerId);
    const currency = intents.get(analysis.intentContractId)?.currency ?? data.household?.defaultCurrency ?? "USD";
    const approval = data.approvals.find((item) => item.analysisId === analysis.id && item.decision === "approve");
    const execution = data.executions.find((item) => item.analysisId === analysis.id);
    return { offer, currency, approval, execution };
  }

  function recordState(analysis: Analysis) {
    const { approval, execution } = context(analysis);
    if (!approval && !execution) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {approval ? <Badge>Consent recorded</Badge> : null}
        {execution ? <Badge tone={execution.status === "failed" ? "danger" : "neutral"}>
          {execution.executionMode === "simulated" ? "Simulated" : "Execution"} {humanize(execution.status).toLowerCase()}
        </Badge> : null}
      </div>
    );
  }

  return (
    <div className="@container min-w-0">
      <ul className="divide-y divide-line @min-[42rem]:hidden">
        {analyses.map((analysis) => {
          const { offer, currency } = context(analysis);
          return (
            <li key={analysis.id} className="px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[14px] font-medium text-ink">{offer?.providerName ?? "Offer"}</h3>
                  <p className="mt-1 text-[12px] leading-5 text-ink-muted">{offer?.planName ?? analysis.offerId}</p>
                </div>
                <DecisionBadge decision={analysis.decision} />
              </div>
              <p className="mt-3 text-[13px] leading-5 text-ink-muted">
                {analysis.decisionReasons[0]?.title ?? "No hard constraint violation recorded."}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-line py-3 text-[12px]">
                <div><dt className="text-ink-muted">12-month household cost</dt><dd className="mt-1 text-[15px]"><Money minor={analysis.totals.proposed12.totalMinor} currency={currency} unknownLabel="Incomplete" /></dd></div>
                <div><dt className="text-ink-muted">Change from current</dt><dd className="mt-1 text-[15px]"><MoneyDelta minor={analysis.totals.delta12Minor} currency={currency} /></dd></div>
                <div><dt className="text-ink-muted">Quotes located</dt><dd className="mt-1 font-mono-num">{analysis.evidenceValidation.valid}/{analysis.evidenceValidation.total}</dd></div>
                <div><dt className="text-ink-muted">Material unknowns</dt><dd className="mt-1 font-mono-num">{analysis.unknowns.length}</dd></div>
              </dl>
              {recordState(analysis)}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-ink-faint">Offer v{analysis.offerVersion} · {formatDate(analysis.createdAt)}</span>
                <Link href={`/app/analyses/${analysis.id}`} className={buttonClass("quiet", "px-3")}>
                  Open analysis <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto @min-[42rem]:block">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Recorded offer decisions, household costs, evidence and next steps</caption>
          <thead className="border-b border-line bg-paper/50 text-[11px] text-ink-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Offer and decision</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">12-month cost</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Change</th>
              <th scope="col" className="px-3 py-3 font-medium">Quotes</th>
              <th scope="col" className="px-5 py-3"><span className="sr-only">Open analysis</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {analyses.map((analysis) => {
              const { offer, currency } = context(analysis);
              return (
                <tr key={analysis.id} className="align-top hover:bg-paper/40">
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{offer?.providerName ?? "Offer"}</span><DecisionBadge decision={analysis.decision} /></div>
                    <p className="mt-1 text-[12px] text-ink-muted">{offer?.planName ?? analysis.offerId}</p>
                    <p className="mt-1 text-[11px] text-ink-faint">v{analysis.offerVersion} · {formatDate(analysis.createdAt)}</p>
                    {recordState(analysis)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right"><Money minor={analysis.totals.proposed12.totalMinor} currency={currency} unknownLabel="Incomplete" /></td>
                  <td className="whitespace-nowrap px-3 py-4 text-right"><MoneyDelta minor={analysis.totals.delta12Minor} currency={currency} /></td>
                  <td className="px-3 py-4"><span className="font-mono-num text-[12px]">{analysis.evidenceValidation.valid}/{analysis.evidenceValidation.total}</span>{analysis.unknowns.length > 0 ? <p className="mt-1 text-[11px] text-caution">{analysis.unknowns.length} unknown</p> : null}</td>
                  <td className="px-5 py-3 text-right"><Link href={`/app/analyses/${analysis.id}`} className={buttonClass("quiet", "px-3 text-[12px]")} aria-label={`Open analysis for ${offer?.providerName ?? "offer"}`}>Open <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
