import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Link2,
  PencilLine,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  InlineNotice,
  Money,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { CommitmentEditor } from "@/components/commitment-editor";
import { getPageContext } from "@/lib/page/context";
import { evidenceForCommitment, getHouseholdData } from "@/lib/page/data";
import { formatDate, formatDateTime, humanize, serviceLabel } from "@/lib/format";
import type { EvidenceStatus } from "@/lib/domain/types";

export const metadata: Metadata = {
  title: "Commitment detail",
};

const statusTone: Record<
  EvidenceStatus,
  "ok" | "info" | "caution" | "danger" | "neutral"
> = {
  verified: "ok",
  user_provided: "info",
  inferred: "neutral",
  unknown: "caution",
  contradicted: "danger",
  stale: "caution",
};

export default async function CommitmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);
  const commitment = data.commitments.find((item) => item.id === id);
  if (!commitment) notFound();

  const benefits = data.benefits.filter(
    (benefit) => benefit.commitmentId === commitment.id,
  );
  const dependencies = data.dependencies.filter(
    (dependency) =>
      dependency.fromCommitmentId === commitment.id ||
      dependency.toCommitmentId === commitment.id,
  );
  const evidence = evidenceForCommitment(data, commitment);
  const verified = evidence.filter((item) => item.status === "verified").length;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/app/commitments"
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          All commitments
        </Link>
      </div>

      <PageHeader
        eyebrow={`${serviceLabel(commitment.serviceType)} · version ${commitment.version}`}
        title={`${commitment.providerName} — ${commitment.planName}`}
        description="The baseline used by every comparison. Each material figure is traceable to a quote, and household edits stay marked as user-provided."
        actions={
          <>
            <Badge tone={commitment.status === "active" ? "ok" : "neutral"}>
              {humanize(commitment.status)}
            </Badge>
            <a href="#edit" className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-raised px-4 py-2 text-[13px] font-medium text-ink hover:border-accent/45">
              <PencilLine className="size-4" />
              Edit baseline
            </a>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="overflow-hidden">
          <Stat
            label="Recurring charge"
            value={<Money minor={commitment.recurringChargeMinor} />}
            detail={`Per ${commitment.billingPeriod === "monthly" ? "month" : commitment.billingPeriod}`}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Standard after promotion"
            value={<Money minor={commitment.standardChargeMinor} unknownLabel="Not stated" />}
            detail={
              commitment.promoEndDate
                ? `Promotion ends ${formatDate(commitment.promoEndDate)}`
                : "No promotion recorded"
            }
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Minimum term"
            value={
              commitment.minimumTermMonths === 0
                ? "None"
                : `${commitment.minimumTermMonths} mo`
            }
            detail={humanize(commitment.renewalType)}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Cancellation fee"
            value={
              <Money minor={commitment.cancellationFeeMinor} unknownLabel="Not stated" />
            }
            detail={`${verified}/${evidence.length} facts verified`}
            tone={
              commitment.cancellationFeeMinor && commitment.cancellationFeeMinor > 0
                ? "caution"
                : "default"
            }
          />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <PanelHeader
            title="Contract facts"
            description="What the household is currently committed to."
          />
          <dl className="grid grid-cols-1 gap-x-8 px-5 py-2 sm:grid-cols-2">
            {[
              ["Service type", serviceLabel(commitment.serviceType)],
              ["Billing period", humanize(commitment.billingPeriod)],
              ["Contract start", formatDate(commitment.contractStart)],
              ["Contract end", formatDate(commitment.contractEnd)],
              ["Renewal type", humanize(commitment.renewalType)],
              ["Promotion end", formatDate(commitment.promoEndDate)],
              [
                "Equipment monthly fee",
                commitment.equipmentMonthlyFeeMinor === null ? (
                  "Not stated"
                ) : (
                  <Money minor={commitment.equipmentMonthlyFeeMinor} />
                ),
              ],
              ["Data allowance", commitment.dataAllowance ?? "Not applicable"],
              [
                "Router",
                commitment.routerIncluded === null
                  ? "Not stated"
                  : commitment.routerIncluded
                    ? "Included"
                    : "Not included",
              ],
              ["Ledger version", `v${commitment.version}`],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0"
              >
                <dt className="text-[12px] text-ink-muted">{label}</dt>
                <dd className="text-right text-[12px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader
              title="Included benefits"
              action={<Sparkles className="size-4 text-accent" />}
            />
            {benefits.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-ink-muted">
                No benefit is recorded against this commitment.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {benefits.map((benefit) => (
                  <li key={benefit.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-medium text-ink">
                          {benefit.description}
                        </div>
                        <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                          {benefit.benefitKey}
                        </div>
                      </div>
                      <div className="text-right">
                        <Money minor={benefit.valueMinor} />
                        <div className="text-[10px] text-ink-faint">
                          per {benefit.billingPeriod === "monthly" ? "month" : "one-off"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge tone={benefit.status === "active" ? "ok" : "caution"}>
                        {humanize(benefit.status)}
                      </Badge>
                      <span className="text-[11px] text-ink-faint">
                        {humanize(benefit.beneficiaryScope)} scope
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Dependencies"
              action={<Link2 className="size-4 text-caution" />}
            />
            {dependencies.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-ink-muted">
                No dependency is recorded for this commitment.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {dependencies.map((dependency) => {
                  const counterpart = data.commitments.find(
                    (item) =>
                      item.id ===
                      (dependency.fromCommitmentId === commitment.id
                        ? dependency.toCommitmentId
                        : dependency.fromCommitmentId),
                  );
                  return (
                    <li key={dependency.id} className="px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <Badge tone="caution">
                          {humanize(dependency.dependencyType)}
                        </Badge>
                        <Money minor={dependency.monthlyImpactMinor} />
                      </div>
                      <p className="mt-2 text-[12px] leading-5 text-ink-muted">
                        {dependency.impactDescription}
                      </p>
                      {counterpart ? (
                        <Link
                          href={`/app/commitments/${counterpart.id}`}
                          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-strong"
                        >
                          {counterpart.providerName}
                          <ArrowRight className="size-3" />
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <Panel>
          <PanelHeader
            title="Evidence"
            description="Quotes are matched against the source text. A user edit is never promoted to a verified provider document."
          />
          {evidence.length === 0 ? (
            <p className="px-5 py-4 text-[12px] text-ink-muted">
              No evidence is attached to this commitment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[12px]">
                <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Field</th>
                    <th className="px-5 py-2.5 font-medium">Quote</th>
                    <th className="px-5 py-2.5 font-medium">Source</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium">Extracted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {evidence.map((item) => (
                    <tr key={item.id} className="align-top hover:bg-surface">
                      <td className="px-5 py-3">
                        <div className="text-ink">{humanize(item.normalizedField ?? "fact")}</div>
                        <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                          {String(item.normalizedValue ?? "—")}
                        </div>
                      </td>
                      <td className="max-w-[360px] px-5 py-3 leading-5 text-ink-muted">
                        “{item.quote}”
                      </td>
                      <td className="px-5 py-3">
                        <div className="inline-flex items-center gap-1.5 text-ink">
                          <FileText className="size-3.5 text-ink-faint" />
                          {item.sourceLabel}
                        </div>
                        <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                          {item.sourceVersionHash.slice(0, 16)}…
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone[item.status]}>
                          {humanize(item.status)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-[11px] text-ink-faint">
                        {formatDateTime(item.extractedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-6" id="edit">
        <Panel>
          <PanelHeader
            title="Edit the baseline"
            description="Use this only when the household's real terms differ from the seeded fixture. Saving creates new evidence and a new version."
          />
          <CommitmentEditor commitment={commitment} />
        </Panel>
      </div>

      <div className="mt-6">
        <InlineNotice tone="info" title="Why versioning matters">
          A past analysis records the commitment versions it used. Changing this
          baseline later does not silently rewrite that decision; use Recalculate
          on an analysis to run the engine again against the current ledger.
        </InlineNotice>
      </div>
    </div>
  );
}
