import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, ReceiptText } from "lucide-react";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { getPageContext } from "@/lib/page/context";
import { getHouseholdData } from "@/lib/page/data";
import { getDatabase } from "@/lib/store/database";
import { verifyReceipt } from "@/lib/services/receipt.service";
import { formatDateTime, humanize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Receipts",
};

const stageTone = {
  analysis: "neutral",
  approval: "caution",
  execution: "accent",
} as const;

export default async function ReceiptsPage() {
  const { household, member } = await getPageContext();
  const data = await getHouseholdData(household.id);
  const database = await getDatabase();

  const verified = data.receipts.map((receipt) => ({
    receipt,
    verification: verifyReceipt(database, receipt),
  }));
  const validCount = verified.filter(
    (item) =>
      item.verification.valid &&
      (item.verification.chainValid === null || item.verification.chainValid),
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="Audit trail"
        title="Receipts"
        description="Append-only decision records. Each receipt carries a content hash and the previous receipt hash, so the chain can be rechecked independently."
        actions={
          <ButtonLink
            href={`/api/households/${household.id}/export`}
            variant="secondary"
          >
            Export household data
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="overflow-hidden">
          <Stat label="Receipts" value={data.receipts.length} />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Hash valid"
            value={validCount}
            tone={validCount === data.receipts.length ? "accent" : "danger"}
            detail={
              validCount === data.receipts.length
                ? "Every content hash matches"
                : "At least one receipt failed verification"
            }
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Latest version"
            value={
              data.receipts[0]
                ? `v${data.receipts[0].receiptVersion}`
                : "None"
            }
            detail="Per-household, gap-free guarantee is not claimed across resets"
          />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel>
          <PanelHeader
            title="Receipt ledger"
            description="Newest first. Verification recomputes the hash from the stored payload; it does not trust the stored hash."
          />
          {data.receipts.length === 0 ? (
            <EmptyState
              icon={<ReceiptText className="size-4" />}
              title="No receipts yet"
              description="A receipt is written when an analysis is created, when consent is recorded, and when a Kite execution completes. Run a comparison to create the first record."
              action={
                <ButtonLink href="/app/compare" variant="secondary">
                  Start a comparison
                </ButtonLink>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-[12px]">
                <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                  <tr>
                    <th className="px-5 py-3 font-medium">Receipt</th>
                    <th className="px-5 py-3 font-medium">Stage</th>
                    <th className="px-5 py-3 font-medium">Analysis</th>
                    <th className="px-5 py-3 font-medium">Hash</th>
                    <th className="px-5 py-3 font-medium">Verification</th>
                    <th className="px-5 py-3 font-medium">Created</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {verified.map(({ receipt, verification }) => {
                    const analysis = data.analyses.find(
                      (item) => item.id === receipt.analysisId,
                    );
                    const offer = analysis
                      ? data.offers.find((item) => item.id === analysis.offerId)
                      : null;
                    const stage = String(receipt.receiptPayload.stage ?? "unknown");
                    const chainOk =
                      verification.chainValid === null ||
                      verification.chainValid === true;
                    return (
                      <tr key={receipt.id} className="align-top hover:bg-surface">
                        <td className="px-5 py-3">
                          <div className="font-medium text-ink">
                            Decision receipt v{receipt.receiptVersion}
                          </div>
                          <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                            {receipt.id}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            tone={
                              stageTone[stage as keyof typeof stageTone] ??
                              "neutral"
                            }
                          >
                            {humanize(stage)}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-ink">
                            {offer?.providerName ?? "Offer"}
                          </div>
                          <div className="text-[10px] text-ink-faint">
                            {offer?.planName ?? receipt.analysisId}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-mono-num text-[10px] text-ink-muted">
                            {receipt.contentHash.slice(0, 18)}…
                          </span>
                          <div className="mt-0.5 text-[10px] text-ink-faint">
                            {receipt.previousReceiptHash
                              ? "linked to previous"
                              : "genesis"}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {verification.valid && chainOk ? (
                            <Badge tone="ok">
                              <CheckCircle2 className="size-3" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge tone="danger">
                              <CircleAlert className="size-3" />
                              Failed
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[11px] text-ink-faint">
                          {formatDateTime(receipt.createdAt)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/app/receipts/${receipt.id}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
                          >
                            Open
                            <ArrowRight className="size-3" />
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

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <ReceiptText className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="text-[11px] leading-5 text-ink-muted">
          Receipts are visible to every household member with access; this is an
          audit record, not a payment credential. Signed in as{" "}
          <span className="font-mono-num">{member?.role ?? "member"}</span>.
        </p>
      </div>
    </div>
  );
}
