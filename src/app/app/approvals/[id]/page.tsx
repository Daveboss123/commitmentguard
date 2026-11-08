import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock,
  FileCheck2,
  LockKeyhole,
  ReceiptText,
  XCircle,
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
  SeverityBadge,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import {
  StartExecutionButton,
  WithdrawApprovalButton,
} from "@/components/approval-actions";
import { getPageContext } from "@/lib/page/context";
import { getApprovalBundle } from "@/lib/services/approval.service";
import { assertAnalysisCurrent } from "@/lib/services/analysis.service";
import { serverConfig } from "@/lib/app/config";
import { serverNow } from "@/lib/app/clock";
import { formatDateTime, humanize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Approval record",
};

const decisionTone = {
  approve: "ok",
  reject: "danger",
  request_changes: "caution",
} as const;

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { household } = await getPageContext();
  const bundle = await getApprovalBundle(id);
  if (bundle.analysis.householdId !== household.id) notFound();

  const { approval, analysis, intent, offer } = bundle;
  const expired = new Date(approval.expiresAt).getTime() <= serverNow();
  const hashMatches = approval.analysisHash === analysis.inputHash;
  const offerMatches = approval.offerVersion === analysis.offerVersion;

  let ledgerStaleReason: string | null = null;
  try {
    await assertAnalysisCurrent(analysis);
  } catch (error) {
    ledgerStaleReason =
      error instanceof Error
        ? error.message
        : "The analysis is no longer current.";
  }

  const approvalIsCurrent =
    approval.decision === "approve" &&
    !expired &&
    hashMatches &&
    offerMatches &&
    ledgerStaleReason === null;

  const executions = [...bundle.executions].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const latestExecution = executions[0] ?? null;

  const acknowledged = analysis.consequences.filter((item) =>
    approval.acknowledgedConsequences.includes(item.id),
  );
  const materialLeft = analysis.consequences.filter(
    (item) =>
      (item.severity === "critical" || item.severity === "high") &&
      !approval.acknowledgedConsequences.includes(item.id),
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[12px] text-ink-muted">
        <Link
          href={`/app/analyses/${analysis.id}`}
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Consequence analysis
        </Link>
        <Link
          href={`/app/approvals`}
          className="inline-flex items-center gap-1.5 hover:text-ink"
        >
          Approval history
        </Link>
      </div>

      <PageHeader
        eyebrow={`Consent record · ${formatDateTime(approval.createdAt)}`}
        title={
          approval.decision === "approve"
            ? "Consent recorded against this exact offer."
            : approval.decision === "reject"
              ? "The household rejected this offer."
              : "Changes were requested before consent."
        }
        description={`${offer?.providerName ?? "Offer"} — ${offer?.planName ?? ""} · approval ${approval.id}`}
        actions={
          <>
            <Badge tone={decisionTone[approval.decision]}>
              {humanize(approval.decision)}
            </Badge>
            <DecisionBadge decision={analysis.decision} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="What was decided"
              description="The service checks the analysis hash, offer version, expiry and every acknowledged consequence before it accepts consent."
              action={
                approvalIsCurrent ? (
                  <Badge tone="ok">
                    <CheckCircle2 className="size-3" />
                    Current
                  </Badge>
                ) : (
                  <Badge tone={approval.decision === "reject" ? "danger" : "caution"}>
                    {approval.decision === "reject"
                      ? "Rejected"
                      : approval.decision === "request_changes"
                        ? "Changes requested"
                        : expired
                          ? "Expired"
                          : "Not current"}
                  </Badge>
                )
              }
            />

            <div className="grid gap-6 px-5 py-4 sm:grid-cols-2">
              <dl>
                <KeyValue label="Decision">
                  <span
                    className={
                      approval.decision === "approve"
                        ? "text-ok"
                        : approval.decision === "reject"
                          ? "text-danger"
                          : "text-caution"
                    }
                  >
                    {humanize(approval.decision)}
                  </span>
                </KeyValue>
                <KeyValue label="Recorded by">{approval.approverUserId}</KeyValue>
                <KeyValue label="Role">{humanize(approval.approverRole)}</KeyValue>
                <KeyValue label="Recorded at">
                  {formatDateTime(approval.createdAt)}
                </KeyValue>
              </dl>
              <dl>
                <KeyValue label="Offer version">
                  <span className="font-mono-num">v{approval.offerVersion}</span>
                </KeyValue>
                <KeyValue label="Bound analysis hash">
                  <span className="font-mono-num text-[10px]">
                    {approval.analysisHash.slice(0, 24)}…
                  </span>
                </KeyValue>
                <KeyValue label="Expires at">
                  <span className={expired ? "text-danger" : ""}>
                    {formatDateTime(approval.expiresAt)}
                  </span>
                </KeyValue>
                <KeyValue label="Approved amount">
                  <Money
                    minor={approval.approvedAmountMinor}
                    currency={approval.currency ?? intent?.currency ?? "USD"}
                    unknownLabel="Not recorded"
                  />
                </KeyValue>
              </dl>
            </div>

            {approval.decision === "approve" && !approvalIsCurrent ? (
              <div className="border-t border-line px-5 py-4">
                <InlineNotice tone="caution" title="This approval is not usable">
                  {expired
                    ? "The 24-hour approval window has closed."
                    : !hashMatches
                      ? "The approval no longer matches the analysis hash."
                      : !offerMatches
                        ? "The offer version changed after approval."
                        : ledgerStaleReason ??
                          "The household ledger changed after this analysis."}{" "}
                  Record a fresh approval against a current analysis.
                </InlineNotice>
              </div>
            ) : null}

            {materialLeft.length > 0 ? (
              <div className="border-t border-line px-5 py-4">
                <InlineNotice tone="danger" title="Unacknowledged material consequences">
                  This record does not acknowledge:{" "}
                  {materialLeft.map((item) => item.title).join("; ")}.
                </InlineNotice>
              </div>
            ) : null}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Acknowledged consequences"
              description="What the approver explicitly accepted at the moment of consent."
              action={
                <Badge tone="neutral">
                  {approval.acknowledgedConsequences.length}
                </Badge>
              }
            />
            {acknowledged.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-ink-muted">
                No consequence was acknowledged for this decision.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {acknowledged.map((item) => (
                  <li key={item.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="text-[13px] font-medium leading-5 text-ink">
                        {item.title}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={item.direction === "loss" ? "danger" : "ok"}
                        >
                          {humanize(item.direction)}
                        </Badge>
                        <SeverityBadge severity={item.severity} />
                      </div>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-ink-muted">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Kite payment sessions"
              description="Only a capped session can exist. A submitted payment cannot be executed twice."
              action={
                <Badge tone={executions.length > 0 ? "accent" : "neutral"}>
                  {executions.length}
                </Badge>
              }
            />
            {executions.length === 0 ? (
              <div className="px-5 py-4">
                <p className="text-[12px] leading-5 text-ink-muted">
                  No Kite session has been requested for this approval. Execution
                  needs a separate capped session and is bound to this approval
                  record.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {executions.map((execution) => (
                  <li
                    key={execution.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <div className="font-mono-num text-[11px] text-ink">
                        {execution.id}
                      </div>
                      <div className="mt-0.5 text-[10px] text-ink-faint">
                        {execution.executionMode === "simulated"
                          ? "Simulated checkout"
                          : "Kite x402"}{" "}
                        · {formatDateTime(execution.updatedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        tone={
                          execution.status === "succeeded"
                            ? "ok"
                            : execution.status === "failed"
                              ? "danger"
                              : execution.status === "cancelled"
                                ? "neutral"
                                : "caution"
                        }
                      >
                        {humanize(execution.status)}
                      </Badge>
                      <Link
                        href={`/app/executions/${execution.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
                      >
                        Open panel
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          {approvalIsCurrent && !latestExecution ? (
            <Panel tone="raised" className="overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
                  <LockKeyhole className="size-4 text-accent" />
                  Request a capped Kite session
                </div>
                <p className="mt-1 text-[12px] leading-5 text-ink-muted">
                  The session is capped before any payment is attempted. The
                  approval is checked again by the service at execution time.
                </p>
              </div>
              <dl className="space-y-2 px-5 py-4 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-faint">Maximum session total</dt>
                  <dd className="font-mono-num text-ink">
                    {serverConfig.kite.maxTotalUsdc} USDC
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-faint">Maximum per transaction</dt>
                  <dd className="font-mono-num text-ink">
                    {serverConfig.kite.maxPerTxUsdc} USDC
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-faint">Session lifetime</dt>
                  <dd className="font-mono-num text-ink">
                    {serverConfig.kite.sessionTtl}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-faint">Execution mode</dt>
                  <dd className="text-right text-ink">
                    {serverConfig.kite.executionMode === "live"
                      ? "Live x402"
                      : "Simulated checkout"}
                  </dd>
                </div>
              </dl>
              <div className="border-t border-line px-5 py-4">
                <StartExecutionButton
                  analysisId={analysis.id}
                  approvalId={approval.id}
                  maxTotalUsdc={serverConfig.kite.maxTotalUsdc}
                  maxPerTxUsdc={serverConfig.kite.maxPerTxUsdc}
                />
              </div>
            </Panel>
          ) : null}

          {latestExecution ? (
            <Panel tone="raised" className="overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <div className="text-[12px] font-medium text-ink">
                  Session already requested
                </div>
                <p className="mt-1 text-[12px] leading-5 text-ink-muted">
                  A duplicate session request is refused. Continue in the payment
                  panel.
                </p>
              </div>
              <div className="px-5 py-4">
                <ButtonLink
                  href={`/app/executions/${latestExecution.id}`}
                  className="w-full"
                >
                  <LockKeyhole className="size-4" />
                  Open the payment panel
                </ButtonLink>
              </div>
            </Panel>
          ) : null}

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Approval chain"
              action={<FileCheck2 className="size-4 text-ink-faint" />}
            />
            <div className="px-5 py-2">
              <dl>
                <KeyValue label="Analysis">
                  <Link
                    href={`/app/analyses/${analysis.id}`}
                    className="font-mono-num text-[10px] text-accent hover:text-accent-strong"
                  >
                    {analysis.id.slice(0, 20)}…
                  </Link>
                </KeyValue>
                <KeyValue label="Receipts">
                  {bundle.receipts.length} linked
                </KeyValue>
                <KeyValue label="Approval expires">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3 text-ink-faint" />
                    {formatDateTime(approval.expiresAt)}
                  </span>
                </KeyValue>
              </dl>
            </div>
            <div className="border-t border-line px-5 py-3">
              <Link
                href="/app/receipts"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-strong"
              >
                <ReceiptText className="size-3.5" />
                Open the receipt ledger
              </Link>
            </div>
          </Panel>

          {approval.decision === "approve" && executions.length === 0 ? (
            <Panel className="px-5 py-4">
              <WithdrawApprovalButton approvalId={approval.id} />
              <p className="mt-2 text-right text-[10px] leading-4 text-ink-faint">
                Withdrawing before a session exists leaves no payment state behind.
              </p>
            </Panel>
          ) : null}

          {approval.decision !== "approve" ? (
            <InlineNotice
              tone={approval.decision === "reject" ? "danger" : "caution"}
              title={
                approval.decision === "reject"
                  ? "Rejected at consent"
                  : "Changes requested"
              }
            >
              <div className="space-y-2">
                <p>
                  No payment session can be created from this approval. Return to
                  the analysis to review the terms, or run a new comparison.
                </p>
                <Link
                  href={`/app/analyses/${analysis.id}`}
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
                >
                  Review the analysis
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </InlineNotice>
          ) : null}

          {approval.decision === "approve" && !approvalIsCurrent && !expired ? (
            <InlineNotice tone="caution" title="Re-approval required">
              <div className="space-y-2">
                <p>
                  The approval no longer matches the current offer or ledger.
                  Recalculate the analysis, then record a fresh approval.
                </p>
                <Link
                  href={`/app/analyses/${analysis.id}`}
                  className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
                >
                  <CircleAlert className="size-3" />
                  Open the stale analysis
                </Link>
              </div>
            </InlineNotice>
          ) : null}

          {approval.decision === "approve" && expired ? (
            <InlineNotice tone="caution" title="Approval expired">
              <div className="flex items-start gap-2">
                <XCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Consent older than 24 hours is not executable. Record a new
                  approval against the current analysis.
                </span>
              </div>
            </InlineNotice>
          ) : null}
        </div>
      </div>
    </div>
  );
}
