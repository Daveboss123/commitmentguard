"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { InlineNotice } from "@/components/ui";
import { buttonClass } from "@/components/button";

export function DemoResetButton({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function reset() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const response = await fetch("/api/demo/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? "The demo database could not be reset.",
        );
      }
      setConfirming(false);
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The demo database could not be reset.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <InlineNotice tone="ok" title="Demo reset">
        The seeded household was restored. Approvals, executions and receipts from
        this session were removed with it.
      </InlineNotice>
    );
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={buttonClass("quiet", "w-full")}
        >
          <RotateCcw className="size-4" />
          Reset the demo household
        </button>
        {error ? (
          <InlineNotice tone="danger" title="Reset failed">
            {error}
          </InlineNotice>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <InlineNotice tone="danger" title="Reset everything in this demo?">
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            The seeded Morgan household is restored and every approval, execution
            and receipt created in this session is deleted. This cannot be undone.
          </span>
        </div>
      </InlineNotice>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className={buttonClass("quiet")}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className={buttonClass("danger")}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Resetting…" : "Reset demo data"}
        </button>
      </div>
    </div>
  );
}
