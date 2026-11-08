"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { buttonClass } from "@/components/button";

export function AnalyseOfferButton({
  intentId,
  offerId,
  label = "Analyse",
}: {
  intentId: string;
  offerId: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId, offerId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        analysis?: { id: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error?.message ?? "The analysis could not be created.");
      }
      router.push(`/app/analyses/${payload.analysis.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The analysis could not be created.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={buttonClass("quiet", "px-2.5 py-1 text-[11px]")}
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
        {busy ? "Running…" : label}
      </button>
      {error ? <span className="max-w-[180px] text-right text-[10px] text-danger">{error}</span> : null}
    </div>
  );
}
