import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Clock,
  Cpu,
  ExternalLink,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  Badge,
  InlineNotice,
  KeyValue,
  Money,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { KitePaymentActions } from "@/components/kite-payment-actions";
import { getPageContext } from "@/lib/page/context";
import { getExecutionBundle, getKiteStatus } from "@/lib/services/execution.service";
import { serverConfig } from "@/lib/app/config";
import { formatDateTime, humanize } from "@/lib/format";
import type { ExecutionStatus } from "@/lib/domain/types";

export const metadata: Metadata = {
  title: "Kite payment panel",
};

const statusTone: Record<
  ExecutionStatus,
  "neutral" | "accent" | "ok" | "caution" | "danger" | "info"
> = {
  not_started: "neutral",
  pending_authorization: "caution",
  authorized: "info",
  submitted: "accent",
  succeeded: "ok",
  failed: "danger",
  cancelled: "neutral",
};

function summaryEntries(
  summary: Record<string, unknown> | null,
): { key: string; value: string }[] {
  if (!summary) return [];
  return Object.entries(summary)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
    }));
}

export default async function ExecutionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { household } = await getPageContext();
  const bundle = await getExecutionBundle(id);
  if (bundle.analysis.householdId !== household.id) notFound();

  const { execution, analysis, approval } = bundle;
  const kiteResult = await Promise.allSettled([getKiteStatus()]);
  const kite = kiteResult[0].status === "fulfilled" ? kiteResult[0].value : null;

  const simulated = execution.executionMode === "simulated";
  const liveExecution = Boolean(
    kite?.executionMode === "live" ||
      execution.executionMode === "kite_x402",
  );
  const canSimulate = kite?.mode === "mock" || simulated;
  const summary = summaryEntries(execution.providerResponseSummary);
  const providerActivation =
    execution.providerResponseSummary &&
    typeof execution.providerResponseSummary.providerActivation === "string"
      ? execution.providerResponseSummary.providerActivation
      : "not_integrated";

  const executionReceipts = bundle.receipts.filter(
    (receipt) => receipt.receiptPayload.stage === "execution",
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px] text-ink-muted">
        <Link
          href={`/app/approvals/${approval.id}`}
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Approval record
        </Link>
        <Link
          href={`/app/analyses/${analysis.id}`}
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          Consequence analysis
        </Link>
      </div>

      <PageHeader
        eyebrow={`Kite payment panel · ${simulated ? "Simulated checkout" : "Kite x402"}`}
        title="A capped payment session, not a blank cheque."
        description={`Execution ${execution.id} · linked to approval ${approval.id}. The session cap, approval hash and duplicate-execution state are checked server-side.`}
        actions={
          <Badge tone={statusTone[execution.status]} className="px-3 py-1 text-[12px]">
            {humanize(execution.status)}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel className="overflow-hidden">
          <Stat
            label="Execution status"
            value={humanize(execution.status)}
            detail={
              execution.sessionStatus
                ? `Session: ${humanize(execution.sessionStatus)}`
                : "No session state recorded"
            }
            tone={
              execution.status === "succeeded"
                ? "accent"
                : execution.status === "failed"
                  ? "danger"
                  : "default"
            }
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Capped amount"
            value={
              execution.amountUsdc ? (
                <span className="font-mono-num">{execution.amountUsdc} USDC</span>
              ) : (
                "Not set"
              )
            }
            detail={`Environment cap ${serverConfig.kite.maxTotalUsdc} USDC`}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Execution mode"
            value={simulated ? "Simulated" : "Kite x402"}
            detail={
              simulated
                ? "No funds move; no real transaction"
                : "Live adapter configured"
            }
            tone={simulated ? "default" : "caution"}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Provider activation"
            value={humanize(providerActivation)}
            detail="Outside the payment layer"
            tone="default"
          />
        </Panel>
      </div>

      {simulated ? (
        <div className="mt-6">
          <InlineNotice tone="info" title="Simulated checkout">
            This is the explicit demo simulator. A “succeeded” execution means the
            mock adapter accepted the capped request. No Kite transaction exists, no
            funds moved, and no provider contract changed.
          </InlineNotice>
        </div>
      ) : (
        <div className="mt-6">
          <InlineNotice tone="caution" title="Live x402 execution">
            This deployment is configured for live execution. A submitted payment is
            still capped by the session and the environment limit, and cannot be
            submitted twice.
          </InlineNotice>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Session state"
              description="Exactly what the adapter returned, and what the service stored."
              action={<LockKeyhole className="size-4 text-ink-faint" />}
            />
            <div className="grid gap-x-8 px-5 py-2 sm:grid-cols-2">
              <dl>
                <KeyValue label="Execution">
                  <span className="font-mono-num text-[10px]">{execution.id}</span>
                </KeyValue>
                <KeyValue label="Approval">
                  <Link
                    href={`/app/approvals/${approval.id}`}
                    className="font-mono-num text-[10px] text-accent hover:text-accent-strong"
                  >
                    {approval.id.slice(0, 22)}…
                  </Link>
                </KeyValue>
                <KeyValue label="Kite request">
                  <span className="font-mono-num text-[10px]">
                    {execution.kiteRequestId ?? "None"}
                  </span>
                </KeyValue>
                <KeyValue label="Kite session">
                  <span className="font-mono-num text-[10px]">
                    {execution.kiteSessionId ?? "None"}
                  </span>
                </KeyValue>
                <KeyValue label="External reference">
                  <span className="font-mono-num text-[10px]">
                    {execution.externalReference ?? "None"}
                  </span>
                </KeyValue>
              </dl>
              <dl>
                <KeyValue label="Created">
                  {formatDateTime(execution.createdAt)}
                </KeyValue>
                <KeyValue label="Updated">
                  {formatDateTime(execution.updatedAt)}
                </KeyValue>
                <KeyValue label="Session status">
                  {execution.sessionStatus
                    ? humanize(execution.sessionStatus)
                    : "Not recorded"}
                </KeyValue>
                <KeyValue label="Error code">
                  {execution.errorCode ? (
                    <span className="text-danger">{execution.errorCode}</span>
                  ) : (
                    "None"
                  )}
                </KeyValue>
                <KeyValue label="Approval expires">
                  {formatDateTime(approval.expiresAt)}
                </KeyValue>
              </dl>
            </div>

            {execution.approvalUrl ? (
              <div className="border-t border-line px-5 py-4">
                <a
                  href={execution.approvalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent-strong"
                >
                  <ExternalLink className="size-3.5" />
                  Open the provider approval page
                </a>
              </div>
            ) : null}

            {summary.length > 0 ? (
              <div className="border-t border-line px-5 py-4">
                <div className="text-[10px] font-medium text-ink-faint">
                  Adapter response summary
                </div>
                <dl className="mt-2 space-y-1.5">
                  {summary.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-baseline justify-between gap-4 text-[11px]"
                    >
                      <dt className="font-mono-num text-ink-faint">{item.key}</dt>
                      <dd className="max-w-[60%] break-words text-right text-ink">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="What this session can and cannot do"
              description="The payment layer is deliberately narrow."
            />
            <ul className="divide-y divide-line">
              {[
                {
                  icon: Wallet,
                  title: "Pay at most the capped amount",
                  body: `The session total is limited to ${execution.amountUsdc ?? serverConfig.kite.maxTotalUsdc} USDC. A larger execution is refused before the adapter is called.`,
                },
                {
                  icon: ShieldCheck,
                  title: "Require a current approval",
                  body: "The approval hash, offer version and 24-hour expiry are rechecked. A stale consent cannot pay.",
                },
                {
                  icon: FileCheck2,
                  title: "Refuse a duplicate submission",
                  body: "Once an execution is submitted or has an external reference, a second submission is refused with EXECUTION_ALREADY_SUBMITTED.",
                },
                {
                  icon: CircleAlert,
                  title: "Never activate the provider",
                  body: "Payment success is not provider activation. Activation is always reported as not_integrated.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3 px-5 py-3.5">
                  <Icon className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div>
                    <div className="text-[12px] font-medium text-ink">{title}</div>
                    <p className="mt-0.5 text-[11px] leading-5 text-ink-muted">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Receipts for this analysis"
              description="Each stage is append-only and hash-chained."
              action={
                <Badge tone="neutral">{bundle.receipts.length}</Badge>
              }
            />
            {bundle.receipts.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-ink-muted">
                No receipt has been written yet.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {bundle.receipts.map((receipt) => (
                  <li
                    key={receipt.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <div className="text-[12px] text-ink">
                        {humanize(
                          String(receipt.receiptPayload.stage ?? "receipt"),
                        )}{" "}
                        stage · v{receipt.receiptVersion}
                      </div>
                      <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                        {receipt.contentHash.slice(0, 22)}…
                      </div>
                    </div>
                    <Link
                      href={`/app/receipts/${receipt.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
                    >
                      Open
                      <ArrowRight className="size-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {executionReceipts.length > 0 ? (
              <div className="border-t border-line px-5 py-3">
                <Link
                  href={`/app/receipts/${executionReceipts[executionReceipts.length - 1].id}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-strong"
                >
                  <ReceiptText className="size-3.5" />
                  Verify the execution receipt
                </Link>
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel tone="raised" className="overflow-hidden">
            <PanelHeader
              title="Kite actions"
              description="Every action is a separate API call. Failures are shown, never hidden."
              action={<KeyRound className="size-4 text-ink-faint" />}
            />
            <div className="px-5 py-5">
              <KitePaymentActions
                executionId={execution.id}
                status={execution.status}
                canSimulate={canSimulate}
                liveExecution={liveExecution}
                approvalUrl={execution.approvalUrl}
              />
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Adapter health"
              description="Reported from the configured adapter, not inferred."
              action={<Cpu className="size-4 text-ink-faint" />}
            />
            <div className="px-5 py-2">
              <dl>
                <KeyValue label="Adapter mode">
                  <span className="font-mono-num">{kite?.mode ?? "Unavailable"}</span>
                </KeyValue>
                <KeyValue label="Execution mode">
                  {kite?.executionMode === "live" ? "Live x402" : "Simulated"}
                </KeyValue>
                <KeyValue label="State">
                  {kite ? humanize(kite.state) : "Unknown"}
                </KeyValue>
                <KeyValue label="Checked">
                  {kite ? formatDateTime(kite.checkedAt) : "—"}
                </KeyValue>
              </dl>
            </div>
            {kite?.note ? (
              <div className="border-t border-line px-5 py-3">
                <p className="text-[11px] leading-5 text-ink-muted">{kite.note}</p>
              </div>
            ) : null}
            <div className="border-t border-line px-5 py-3">
              <Link
                href="/app/integrations"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-strong"
              >
                Integration details
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Approval context" />
            <div className="px-5 py-2">
              <dl>
                <KeyValue label="Offer version">
                  <span className="font-mono-num">v{approval.offerVersion}</span>
                </KeyValue>
                <KeyValue label="Approved amount">
                  <Money
                    minor={approval.approvedAmountMinor}
                    currency={approval.currency ?? "USD"}
                    unknownLabel="Not recorded"
                  />
                </KeyValue>
                <KeyValue label="Approver">
                  <span className="font-mono-num text-[10px]">
                    {approval.approverUserId}
                  </span>
                </KeyValue>
                <KeyValue label="Approval hash">
                  <span className="font-mono-num text-[10px]">
                    {approval.analysisHash.slice(0, 18)}…
                  </span>
                </KeyValue>
              </dl>
            </div>
            <div className="border-t border-line px-5 py-3">
              <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                <Clock className="size-3.5 text-ink-faint" />
                Approval expires {formatDateTime(approval.expiresAt)}
              </div>
            </div>
          </Panel>

          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink-muted">
              <CircleAlert className="size-3.5 text-caution" />
              No fake payment proof
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
              A simulated success is labelled simulated everywhere. The receipt
              records the adapter result and the absence of provider activation.
            </p>
          </div>

          <ButtonLink
            href={`/app/receipts`}
            variant="secondary"
            className="w-full"
          >
            <ReceiptText className="size-4" />
            Open the receipt ledger
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
