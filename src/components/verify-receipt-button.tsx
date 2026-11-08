"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { Badge, InlineNotice } from "@/components/ui";
import { buttonClass } from "@/components/button";

interface VerificationResponse {
  verification?: {
    valid: boolean;
    computedHash: string;
    storedHash: string;
    chainValid: boolean | null;
    previousReceiptHash: string | null;
    previousReceiptFound: boolean;
    checkedAt: string;
  };
  error?: { message?: string };
}

export function VerifyReceiptButton({ receiptId }: { receiptId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    VerificationResponse["verification"] | null
  >(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/receipts/${receiptId}/verify`);
      const payload = (await response.json().catch(() => ({}))) as VerificationResponse;
      if (!response.ok || !payload.verification) {
        throw new Error(
          payload.error?.message ?? "The receipt could not be verified.",
        );
      }
      setResult(payload.verification);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The receipt could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={verify}
        disabled={busy}
        className={buttonClass("primary", "w-full")}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCw className="size-4" />
        )}
        {busy ? "Recomputing the hash…" : "Verify this receipt now"}
      </button>

      {error ? (
        <InlineNotice tone="danger" title="Verification failed">
          {error}
        </InlineNotice>
      ) : null}

      {result ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-muted">Content hash</span>
            {result.valid ? (
              <Badge tone="ok">
                <CheckCircle2 className="size-3" />
                Valid
              </Badge>
            ) : (
              <Badge tone="danger">
                <CircleAlert className="size-3" />
                Invalid
              </Badge>
            )}
          </div>
          <dl className="space-y-2 text-[10px]">
            <div>
              <dt className="text-ink-faint">Computed</dt>
              <dd className="break-all font-mono-num text-ink">
                {result.computedHash}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint">Stored</dt>
              <dd className="break-all font-mono-num text-ink">
                {result.storedHash}
              </dd>
            </div>
          </dl>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
            <span className="text-[11px] text-ink-muted">Chain link</span>
            {result.chainValid === null ? (
              <Badge tone="neutral">Genesis receipt</Badge>
            ) : result.chainValid ? (
              <Badge tone="ok">Linked</Badge>
            ) : (
              <Badge tone="danger">Broken</Badge>
            )}
          </div>
          <p className="text-[10px] leading-4 text-ink-faint">
            Checked {new Date(result.checkedAt).toLocaleString("en-GB")}. This
            recomputation is read-only and safe to repeat.
          </p>
        </div>
      ) : (
        <p className="text-[11px] leading-5 text-ink-muted">
          The page loaded a verification result below. Run it again to recompute
          from the stored payload.
        </p>
      )}
    </div>
  );
}
