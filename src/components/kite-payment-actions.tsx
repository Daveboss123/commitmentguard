"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  ExternalLink,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { buttonClass } from "@/components/button";
import { InlineNotice } from "@/components/ui";
import type { ExecutionStatus } from "@/lib/domain/types";

function message(payload: unknown, fallback: string): string {
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

export function KitePaymentActions({
  executionId,
  status,
  canSimulate,
  liveExecution,
  approvalUrl,
}: {
  executionId: string;
  status: ExecutionStatus;
  canSimulate: boolean;
  liveExecution: boolean;
  approvalUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, label: string) {
    setBusy(label);
    setError(null);
    try {
      const response = await fetch(path, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        receipt?: { id: string };
      };
      if (!response.ok) {
        throw new Error(
          message(payload, "The Kite action did not complete."),
        );
      }
      if (label === "execute" && payload.receipt?.id) {
        router.push(`/app/receipts/${payload.receipt.id}`);
        return;
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Kite action did not complete.",
      );
    } finally {
      setBusy(null);
    }
  }

  const refreshable = !["succeeded", "cancelled"].includes(status);
  const canExecute = status === "authorized";
  const canCancel = ["pending_authorization", "authorized"].includes(status);
  const canSimulateNow = canSimulate && status === "pending_authorization";

  return (
    <div className="space-y-4">
      {error ? (
        <InlineNotice tone="danger" title="Nothing was executed">
          {error}
        </InlineNotice>
      ) : null}

      {approvalUrl ? (
        <a
          href={approvalUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonClass("secondary", "w-full")}
        >
          <ExternalLink className="size-4" />
          Open the Passport approval
        </a>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() =>
            post(`/api/executions/${executionId}/refresh`, "refresh")
          }
          disabled={busy !== null || !refreshable}
          className={buttonClass("quiet", "w-full")}
        >
          {busy === "refresh" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Refresh session status
        </button>

        {canSimulate ? (
          <button
            type="button"
            onClick={() =>
              post(`/api/executions/${executionId}/simulate`, "simulate")
            }
            disabled={busy !== null || !canSimulateNow}
            className={buttonClass("secondary", "w-full")}
          >
            {busy === "simulate" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Simulate passport approval
          </button>
        ) : null}

        <button
          type="button"
          onClick={() =>
            post(`/api/executions/${executionId}/execute`, "execute")
          }
          disabled={busy !== null || !canExecute}
          className={buttonClass("primary", "w-full")}
        >
          {busy === "execute" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PlayCircle className="size-4" />
          )}
          {liveExecution ? "Execute approved payment" : "Execute simulated payment"}
        </button>

        <button
          type="button"
          onClick={() =>
            post(`/api/executions/${executionId}/cancel`, "cancel")
          }
          disabled={busy !== null || !canCancel}
          className={buttonClass("danger", "w-full")}
        >
          {busy === "cancel" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Ban className="size-4" />
          )}
          Cancel session
        </button>
      </div>

      <p className="text-[11px] leading-5 text-ink-faint">
        {liveExecution
          ? "This deployment is configured for live x402 execution. The service still enforces the approval hash, expiry, session cap and duplicate-execution checks."
          : "Simulated checkout. No funds move, no Kite transaction is created and no provider contract changes."}
      </p>
    </div>
  );
}
