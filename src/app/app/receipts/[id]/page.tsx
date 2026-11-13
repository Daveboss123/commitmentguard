import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileText,
  Link2,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  DecisionBadge,
  InlineNotice,
  KeyValue,
  Money,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { VerifyReceiptButton } from "@/components/verify-receipt-button";
import { getPageContext } from "@/lib/page/context";
import { getReceipt, getAnalysis } from "@/lib/store/repository";
import { getDatabase } from "@/lib/store/database";
import { verifyReceipt } from "@/lib/services/receipt.service";
import { formatDateTime, humanize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Receipt",
};

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { household } = await getPageContext();
  const receipt = await getReceipt(id);
  if (!receipt || receipt.householdId !== household.id) notFound();

  const database = await getDatabase();
  const verification = verifyReceipt(database, receipt);
  const analysis = await getAnalysis(receipt.analysisId);
  const previousReceipt = receipt.previousReceiptHash
    ? database.receipts.find(
        (item) => item.contentHash === receipt.previousReceiptHash,
      ) ?? null
    : null;
  const nextReceipt = database.receipts.find(
    (item) => item.previousReceiptHash === receipt.contentHash,
  );

  const payload = receipt.receiptPayload;
  const stage = String(payload.stage ?? "unknown");
  const offer =
    payload.offer && typeof payload.offer === "object"
      ? (payload.offer as Record<string, unknown>)
      : null;
  const chainOk =
    verification.chainValid === null || verification.chainValid === true;

  const formatOk = verification.formatValid;
  const linkedAnalysisOk = verification.linkedAnalysisValid;

  const verifierChecks: Array<{
    label: string;
    detail: string;
    state: "pass" | "fail" | "not_checked" | "genesis";
  }> = [
    {
      label: "Canonical payload format",
      detail: formatOk
        ? "kind, schema version, stage, analysis id and analysis hash are present."
        : "One or more required fields are missing or the wrong type.",
      state: formatOk ? "pass" : "fail",
    },
    {
      label: "Payload hash",
      detail: verification.valid
        ? "The recomputed hash equals the stored content hash."
        : "The recomputed hash does not match the stored hash.",
      state: verification.valid ? "pass" : "fail",
    },
    {
      label: "Chain link",
      detail:
        verification.chainValid === null
          ? "Genesis receipt: no previous hash is expected."
          : verification.chainValid
            ? "The preceding receipt belongs to this household, has the previous version, and its payload hash recomputes correctly."
            : "The previous hash does not identify an existing receipt.",
      state:
        verification.chainValid === null
          ? "genesis"
          : verification.chainValid
            ? "pass"
            : "fail",
    },
    {
      label: "Linked analysis",
      detail: linkedAnalysisOk
        ? "The receipt's analysis id and analysis hash match the stored analysis."
        : "The receipt does not point at a stored analysis with the same hash.",
      state: linkedAnalysisOk ? "pass" : "fail",
    },
    {
      label: "Stage order",
      detail:
        verification.stageOrderValid
          ? "The actual hash-linked ancestry was traversed: required earlier stages exist in order, with no missing links or cycles."
          : "The hash-linked ancestry is incomplete, corrupt, or missing a required earlier stage.",
      state: verification.stageOrderValid ? "pass" : "fail",
    },
    {
      label: "Cryptographic signature",
      detail: "No signing key is integrated. A hash is integrity, not authorship.",
      state: "not_checked",
    },
    {
      label: "Provider activation and settlement",
      detail: "Not proven by any receipt field; simulated execution is labelled.",
      state: "not_checked",
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px] text-ink-muted">
        <Link
          href="/app/receipts"
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          All receipts
        </Link>
        {analysis ? (
          <Link
            href={`/app/analyses/${analysis.id}`}
            className="inline-flex items-center gap-1.5 hover:text-ink"
          >
            <FileText className="size-3.5" />
            Consequence analysis
          </Link>
        ) : null}
        {previousReceipt ? (
          <Link
            href={`/app/receipts/${previousReceipt.id}`}
            className="inline-flex items-center gap-1.5 hover:text-ink"
          >
            <Link2 className="size-3.5" />
            Previous receipt
          </Link>
        ) : null}
      </div>

      <PageHeader
        eyebrow={`Decision receipt · ${humanize(stage)} stage · v${receipt.receiptVersion}`}
        title="A record that can be checked, not just stored."
        description={`Receipt ${receipt.id} · ${formatDateTime(receipt.createdAt)}. The content hash is recomputed from the payload; the chain link is checked against the previous receipt.`}
        actions={
          verification.verified ? (
            <Badge tone="ok" className="px-3 py-1 text-[12px]">
              <CheckCircle2 className="size-3.5" />
              Verified
            </Badge>
          ) : (
            <Badge tone="danger" className="px-3 py-1 text-[12px]">
              <CircleAlert className="size-3.5" />
              Verification failed
            </Badge>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="overflow-hidden">
          <Stat
            label="Content hash"
            value={verification.valid ? "Matches" : "Mismatch"}
            detail={`${receipt.contentHash.slice(0, 16)}…`}
            tone={verification.valid ? "accent" : "danger"}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Chain"
            value={
              verification.chainValid === null
                ? "Genesis"
                : verification.chainValid
                  ? "Linked"
                  : "Broken"
            }
            detail={
              previousReceipt
                ? `Previous v${previousReceipt.receiptVersion} found`
                : "No previous receipt"
            }
            tone={
              verification.chainValid === null
                ? "default"
                : verification.chainValid
                  ? "accent"
                  : "danger"
            }
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Stage"
            value={humanize(stage)}
            detail="Analysis → approval → execution"
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Linked analysis"
            value={analysis ? humanize(analysis.decision) : "Missing"}
            detail={receipt.analysisId.slice(0, 20)}
          />
        </Panel>
      </div>

      {!verification.valid || !chainOk ? (
        <div className="mt-6">
          <InlineNotice tone="danger" title="This receipt does not verify">
            Do not treat this record as trustworthy. The stored payload or the
            chain link has changed since the receipt was written.
          </InlineNotice>
        </div>
      ) : (
        <div className="mt-6">
          <InlineNotice tone="ok" title="Receipt verified on load">
            The content hash matches the stored payload and the previous-hash link
            is intact. Use the button to recompute it again at any time.
          </InlineNotice>
        </div>
      )}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="space-y-6">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Receipt header"
              description="The hash covers the canonical payload, not this presentation."
              action={<ReceiptText className="size-4 text-ink-faint" />}
            />
            <div className="grid gap-x-8 px-5 py-2 sm:grid-cols-2">
              <dl>
                <KeyValue label="Receipt">
                  <span className="font-mono-num text-[10px]">{receipt.id}</span>
                </KeyValue>
                <KeyValue label="Version">
                  {receipt.receiptVersion}
                </KeyValue>
                <KeyValue label="Stage">{humanize(stage)}</KeyValue>
                <KeyValue label="Created">
                  {formatDateTime(receipt.createdAt)}
                </KeyValue>
              </dl>
              <dl>
                <KeyValue label="Household">
                  <span className="font-mono-num text-[10px]">
                    {receipt.householdId}
                  </span>
                </KeyValue>
                <KeyValue label="Analysis">
                  <span className="font-mono-num text-[10px]">
                    {receipt.analysisId}
                  </span>
                </KeyValue>
                <KeyValue label="Content hash">
                  <span className="break-all font-mono-num text-[10px]">
                    {receipt.contentHash}
                  </span>
                </KeyValue>
                <KeyValue label="Previous hash">
                  <span className="break-all font-mono-num text-[10px]">
                    {receipt.previousReceiptHash ?? "None (genesis)"}
                  </span>
                </KeyValue>
              </dl>
            </div>
            <div className="border-t border-line px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-ink-muted">
                  {nextReceipt
                    ? `Next receipt: v${nextReceipt.receiptVersion}`
                    : "No later receipt links to this one"}
                </span>
                {nextReceipt ? (
                  <Link
                    href={`/app/receipts/${nextReceipt.id}`}
                    className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-strong"
                  >
                    Next
                    <ArrowRight className="size-3" />
                  </Link>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Canonical payload"
              description="Stored as written. Changing any value would change the content hash."
            />
            <pre className="max-h-[560px] overflow-auto bg-[#1b2420] px-5 py-4 font-mono-num text-[11px] leading-5 text-[#e9e4d6]">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel tone="raised" className="overflow-hidden">
            <PanelHeader
              title="Verify again"
              description="Runs the same check the download export relies on."
              action={<ShieldCheck className="size-4 text-accent" />}
            />
            <div className="px-5 py-5">
              <VerifyReceiptButton receiptId={receipt.id} />
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Verifier checks"
              description="What this page actually checked, and what it deliberately did not."
              action={
                <Badge
                  tone={
                    verifierChecks.some((check) => check.state === "fail")
                      ? "danger"
                      : "ok"
                  }
                >
                  {verifierChecks.filter((check) => check.state === "pass").length}{" "}
                  passed
                </Badge>
              }
            />
            <ul className="divide-y divide-line">
              {verifierChecks.map((check) => (
                <li key={check.label} className="flex gap-2.5 px-5 py-2.5">
                  <span className="mt-0.5 shrink-0">
                    {check.state === "pass" ? (
                      <CheckCircle2 className="size-3.5 text-ok" />
                    ) : check.state === "fail" ? (
                      <CircleAlert className="size-3.5 text-danger" />
                    ) : (
                      <CircleAlert className="size-3.5 text-ink-faint" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-ink">
                        {check.label}
                      </span>
                      {check.state === "not_checked" ? (
                        <Badge tone="neutral">Not checked</Badge>
                      ) : check.state === "genesis" ? (
                        <Badge tone="neutral">Genesis</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">
                      {check.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {analysis ? (
            <Panel className="overflow-hidden">
              <PanelHeader
                title="Decision context"
                description={`${String(payload.offer ? "Offer" : "Analysis")} ${
                  offer && typeof offer.providerName === "string"
                    ? `— ${offer.providerName}`
                    : ""
                }`}
                action={<DecisionBadge decision={analysis.decision} />}
              />
              <div className="px-5 py-2">
                <dl>
                  <KeyValue label="Plan">
                    {offer && typeof offer.planName === "string"
                      ? offer.planName
                      : "—"}
                  </KeyValue>
                  <KeyValue label="Offer version">
                    <span className="font-mono-num">v{analysis.offerVersion}</span>
                  </KeyValue>
                  <KeyValue label="Proposed 12 months">
                    <Money
                      minor={analysis.totals.proposed12.totalMinor}
                      unknownLabel="Incomplete"
                    />
                  </KeyValue>
                  <KeyValue label="Difference, 12 months">
                    <Money
                      minor={
                        analysis.totals.delta12Minor === null
                          ? null
                          : Math.abs(analysis.totals.delta12Minor)
                      }
                      unknownLabel="Incomplete"
                      className={
                        analysis.totals.delta12Minor !== null &&
                        analysis.totals.delta12Minor > 0
                          ? "text-danger"
                          : "text-ok"
                      }
                    />
                  </KeyValue>
                  <KeyValue label="Unknowns">
                    {analysis.unknowns.length === 0 ? (
                      <Badge tone="ok">None material</Badge>
                    ) : (
                      <Badge tone="caution">
                        {analysis.unknowns.length} unresolved
                      </Badge>
                    )}
                  </KeyValue>
                </dl>
              </div>
              <div className="border-t border-line px-5 py-3">
                <ButtonLink
                  href={`/app/analyses/${analysis.id}`}
                  variant="secondary"
                  className="w-full"
                >
                  Open the analysis
                </ButtonLink>
              </div>
            </Panel>
          ) : null}

          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink-muted">
              <CircleAlert className="size-3.5 text-caution" />
              What a receipt does not prove
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
              A valid hash proves the record was not edited. It does not prove that
              a provider activated a service or that a payment moved real funds.
              Those states are reported separately, and simulated execution is
              always labelled.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
