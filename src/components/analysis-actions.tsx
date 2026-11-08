"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { buttonClass } from "@/components/button";

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

export function ExplainAnalysisButton({
  analysisId,
  hasExplanation,
}: {
  analysisId: string;
  hasExplanation: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/explanation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: hasExplanation }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          message(payload, "SERV could not produce an explanation. The decision is unchanged."),
        );
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "SERV could not produce an explanation. The decision is unchanged.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={buttonClass("quiet")}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? "SERV is explaining…" : hasExplanation ? "Regenerate explanation" : "Explain with SERV"}
      </button>
      {error ? (
        <span className="max-w-[300px] text-right text-[10px] leading-4 text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function RecalculateAnalysisButton({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/recalculate`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        analysis?: { id: string };
      };
      if (!response.ok || !payload.analysis) {
        throw new Error(message(payload, "The analysis could not be recalculated."));
      }
      router.push(`/app/analyses/${payload.analysis.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The analysis could not be recalculated.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={buttonClass("ghost")}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        {busy ? "Recalculating…" : "Recalculate against current ledger"}
      </button>
      {error ? (
        <span className="max-w-[300px] text-right text-[10px] leading-4 text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
