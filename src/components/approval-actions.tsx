"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, Undo2 } from "lucide-react";
import { buttonClass } from "@/components/button";
import { InlineNotice } from "@/components/ui";

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

export function StartExecutionButton({
  analysisId,
  approvalId,
  maxTotalUsdc,
  maxPerTxUsdc,
}: {
  analysisId: string;
  approvalId: string;
  maxTotalUsdc: string;
  maxPerTxUsdc: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/executions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId,
          maxTotalUsdc,
          maxPerTxUsdc,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        execution?: { id: string };
      };
      if (!response.ok || !payload.execution?.id) {
        throw new Error(
          message(
            payload,
            "The Kite session could not be requested. Nothing was executed.",
          ),
        );
      }
      router.push(`/app/executions/${payload.execution.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Kite session could not be requested. Nothing was executed.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={buttonClass("primary")}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LockKeyhole className="size-4" />
        )}
        {busy ? "Requesting a capped session…" : "Request a capped Kite session"}
      </button>
      {error ? (
        <span className="max-w-[340px] text-right text-[11px] leading-4 text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function WithdrawApprovalButton({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/approvals/${approvalId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "request_changes",
          acknowledgedConsequences: [],
          approverRole: "owner",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          message(payload, "The approval could not be withdrawn."),
        );
      }
      setConfirming(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The approval could not be withdrawn.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={buttonClass("ghost")}
        >
          <Undo2 className="size-4" />
          Withdraw consent
        </button>
        {error ? (
          <span className="max-w-[300px] text-right text-[10px] leading-4 text-danger">
            {error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-[360px]">
      <InlineNotice tone="caution" title="Withdraw this approval?">
        This records a request-changes decision. Any payment session that is already
        authorized is not cancelled by this action.
      </InlineNotice>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className={buttonClass("quiet")}
        >
          Keep approval
        </button>
        <button
          type="button"
          onClick={withdraw}
          disabled={busy}
          className={buttonClass("danger")}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Withdraw
        </button>
      </div>
    </div>
  );
}
