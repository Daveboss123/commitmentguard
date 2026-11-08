import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Wallet } from "lucide-react";
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
import { formatDateTime, humanize } from "@/lib/format";
import type { ExecutionStatus } from "@/lib/domain/types";

export const metadata: Metadata = {
  title: "Payment sessions",
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

export default async function ExecutionsPage() {
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);

  const succeeded = data.executions.filter(
    (item) => item.status === "succeeded",
  ).length;
  const active = data.executions.filter((item) =>
    ["pending_authorization", "authorized", "submitted"].includes(item.status),
  ).length;
  const simulated = data.executions.filter(
    (item) => item.executionMode === "simulated",
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow="Kite"
        title="Payment sessions"
        description="A session is created only from a current approval, with a hard USDC cap. Payment success is separate from provider activation."
        actions={
          <ButtonLink href="/app/approvals" variant="secondary">
            <LockKeyhole className="size-4" />
            Approvals
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="overflow-hidden">
          <Stat label="Sessions" value={data.executions.length} />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Active"
            value={active}
            detail="Pending, authorized or submitted"
            tone={active > 0 ? "caution" : "default"}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Succeeded"
            value={succeeded}
            detail={`${simulated} simulated overall`}
            tone={succeeded > 0 ? "accent" : "default"}
          />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel>
          <PanelHeader
            title="Session ledger"
            description="Newest first. The amount is the cap the session was created with, not a guaranteed charge."
            action={<Wallet className="size-4 text-ink-faint" />}
          />
          {data.executions.length === 0 ? (
            <EmptyState
              icon={<Wallet className="size-4" />}
              title="No Kite session has been requested"
              description="Approve a compliant analysis first, then request a capped session from the approval record. Execution is a separate action."
              action={
                <ButtonLink href="/app/approvals" variant="secondary">
                  Open approvals
                </ButtonLink>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[12px]">
                <thead className="border-b border-line bg-surface text-[11px] text-ink-faint">
                  <tr>
                    <th className="px-5 py-3 font-medium">Session</th>
                    <th className="px-5 py-3 font-medium">Mode</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Cap</th>
                    <th className="px-5 py-3 font-medium">Updated</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.executions.map((execution) => {
                    const analysis = data.analyses.find(
                      (item) => item.id === execution.analysisId,
                    );
                    const offer = analysis
                      ? data.offers.find((item) => item.id === analysis.offerId)
                      : null;
                    return (
                      <tr
                        key={execution.id}
                        className="align-top hover:bg-surface"
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-ink">
                            {offer?.providerName ?? "Offer"}
                          </div>
                          <div className="text-[11px] text-ink-faint">
                            {offer?.planName ?? execution.analysisId}
                          </div>
                          <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                            {execution.id}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Badge
                            tone={
                              execution.executionMode === "simulated"
                                ? "neutral"
                                : "caution"
                            }
                          >
                            {execution.executionMode === "simulated"
                              ? "Simulated"
                              : "Kite x402"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          <Badge tone={statusTone[execution.status]}>
                            {humanize(execution.status)}
                          </Badge>
                          {execution.errorCode ? (
                            <div className="mt-1 font-mono-num text-[10px] text-danger">
                              {execution.errorCode}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 text-right font-mono-num">
                          {execution.amountUsdc
                            ? `${execution.amountUsdc} USDC`
                            : "—"}
                        </td>
                        <td className="px-5 py-3 text-[11px] text-ink-faint">
                          {formatDateTime(execution.updatedAt)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/app/executions/${execution.id}`}
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

      <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-3">
        <p className="text-[11px] leading-5 text-ink-muted">
          Payments are in USDC through Kite, capped to{" "}
          <span className="font-mono-num">0.05 USDC</span> by default in this demo.
          The approved household amount is a separate fiat figure and is never
          charged by the demo simulator.
        </p>
      </div>
    </div>
  );
}
