"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Radar } from "lucide-react";
import { Badge, InlineNotice } from "@/components/ui";
import { buttonClass } from "@/components/button";

interface ServHealthView {
  configured: boolean;
  enabled: boolean;
  model: string;
  baseUrl: string;
  reachable: boolean | null;
  latencyMs: number | null;
  responseId: string | null;
  checkedAt: string;
  error: string | null;
}

export function ServProbeButton() {
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<ServHealthView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function probe() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/serv/status?probe=1");
      const payload = (await response.json().catch(() => ({}))) as {
        status?: ServHealthView;
        error?: { message?: string };
      };
      if (!response.ok || !payload.status) {
        throw new Error(payload.error?.message ?? "SERV could not be probed.");
      }
      setHealth(payload.status);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "SERV could not be probed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={probe}
        disabled={busy}
        className={buttonClass("secondary", "w-full")}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Radar className="size-4" />
        )}
        {busy ? "Probing SERV…" : "Probe SERV (one small live request)"}
      </button>

      {error ? (
        <InlineNotice tone="danger" title="Probe failed">
          {error}
        </InlineNotice>
      ) : null}

      {health ? (
        <div className="rounded-xl border border-line bg-raised px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-muted">Reachability</span>
            {health.reachable ? (
              <Badge tone="ok">
                <CheckCircle2 className="size-3" />
                Reachable
              </Badge>
            ) : (
              <Badge tone="danger">
                <CircleAlert className="size-3" />
                Unreachable
              </Badge>
            )}
          </div>
          <dl className="mt-2 space-y-1.5 text-[10px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Model</dt>
              <dd className="font-mono-num text-ink">{health.model}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Latency</dt>
              <dd className="font-mono-num text-ink">
                {health.latencyMs === null ? "—" : `${health.latencyMs} ms`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Checked</dt>
              <dd className="text-right text-ink">
                {new Date(health.checkedAt).toLocaleString("en-GB")}
              </dd>
            </div>
            {health.error ? (
              <div className="pt-1 text-danger">{health.error}</div>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="text-[11px] leading-5 text-ink-faint">
          Not probed on this page load. A probe is a live, low-token SERV call; it
          is never reported as healthy from configuration alone.
        </p>
      )}
    </div>
  );
}
