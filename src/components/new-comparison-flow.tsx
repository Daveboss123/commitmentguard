"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  FileUp,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { IntentContract, Offer } from "@/lib/domain/types";
import { Badge, InlineNotice, Money, Panel } from "@/components/ui";
import { buttonClass } from "@/components/button";

interface WizardOffer {
  id: string;
  providerName: string;
  planName: string;
  sourceLabel: string;
  offerVersion: number;
  status: Offer["status"];
  promoPriceMinor: number | null;
  promoMonths: number | null;
  standardPriceMinor: number | null;
  minimumTermMonths: number | null;
  installationFeeMinor: number | null;
  cancellationFeeMinor: number | null;
  excludedBenefits: string[];
  unknowns: string[];
}

interface ExtractionMeta {
  source: "serv" | "demo_parser";
  model: string;
  responseId: string | null;
  latencyMs: number | null;
  warning: string | null;
}

function toWizardOffer(offer: Offer): WizardOffer {
  return {
    id: offer.id,
    providerName: offer.providerName,
    planName: offer.planName,
    sourceLabel: offer.sourceLabel,
    offerVersion: offer.offerVersion,
    status: offer.status,
    promoPriceMinor: offer.terms.promotionalMonthlyPriceMinor,
    promoMonths: offer.terms.promotionalMonths,
    standardPriceMinor: offer.terms.standardMonthlyPriceMinor,
    minimumTermMonths: offer.terms.minimumTermMonths,
    installationFeeMinor: offer.terms.installationFeeMinor,
    cancellationFeeMinor: offer.terms.cancellationFeeMinor,
    excludedBenefits: offer.terms.excludedBenefits.map((item) => item.description),
    unknowns: offer.terms.materialUnknowns,
  };
}

function dollars(value: number | null): string {
  return value === null ? "" : (value / 100).toFixed(2);
}

function errorMessage(payload: unknown, fallback: string): string {
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

export function NewComparisonFlow({
  householdId,
  demoRequest,
  servConfigured,
  servModel,
  offers: initialOffers,
}: {
  householdId: string;
  demoRequest: string;
  servConfigured: boolean;
  servModel: string;
  offers: WizardOffer[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [request, setRequest] = useState(demoRequest);
  const [intent, setIntent] = useState<IntentContract | null>(null);
  const [meta, setMeta] = useState<ExtractionMeta | null>(null);
  const [confirmedIntent, setConfirmedIntent] = useState<IntentContract | null>(null);

  const [goal, setGoal] = useState("");
  const [minSaving, setMinSaving] = useState("");
  const [maxTerm, setMaxTerm] = useState("");
  const [unknownPolicy, setUnknownPolicy] = useState<"review" | "block">("review");

  const [offers, setOffers] = useState<WizardOffer[]>(initialOffers);
  const [selected, setSelected] = useState<string[]>(
    initialOffers.map((offer) => offer.id),
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [offerLabel, setOfferLabel] = useState("Pasted offer document");
  const [offerText, setOfferText] = useState("");
  const [uploading, setUploading] = useState(false);

  const [analysisState, setAnalysisState] = useState<
    Record<string, "queued" | "running" | "done" | "error">
  >({});
  const [analysisIds, setAnalysisIds] = useState<string[]>([]);
  const [analysisErrors, setAnalysisErrors] = useState<string[]>([]);

  async function extractConstraints() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/intents/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, request }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        intent?: IntentContract;
        extraction?: ExtractionMeta;
      };
      if (!response.ok || !payload.intent) {
        throw new Error(
          errorMessage(payload, "SERV could not extract a confirmed intent. Nothing was analysed."),
        );
      }
      const extracted = payload.intent;
      setIntent(extracted);
      setMeta(payload.extraction ?? null);
      setGoal(extracted.goal);
      setMinSaving(dollars(extracted.minimumMonthlySavingMinor));
      setMaxTerm(
        extracted.maxContractMonths === null ? "" : String(extracted.maxContractMonths),
      );
      setUnknownPolicy(extracted.unknownCriticalTermsPolicy);
      setConfirmedIntent(null);
      setStep(2);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "SERV could not extract a confirmed intent. Nothing was analysed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmConstraints() {
    if (!intent) return;
    setBusy(true);
    setError(null);
    try {
      const savingMinor = minSaving.trim()
        ? Math.round(Number.parseFloat(minSaving) * 100)
        : null;
      const term = maxTerm.trim() ? Number.parseInt(maxTerm, 10) : null;
      if (savingMinor !== null && (!Number.isFinite(savingMinor) || savingMinor < 0)) {
        throw new Error("The minimum monthly saving must be a valid non-negative amount.");
      }
      if (term !== null && (!Number.isFinite(term) || term < 1)) {
        throw new Error("The maximum contract months must be a positive whole number.");
      }

      const response = await fetch(`/api/intents/${intent.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          minimumMonthlySavingMinor: savingMinor,
          maxContractMonths: term,
          mustKeepBenefits: intent.mustKeepBenefits,
          mustHave: intent.mustHave,
          mustNotHave: intent.mustNotHave,
          softPreferences: intent.softPreferences,
          unknownCriticalTermsPolicy: unknownPolicy,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        intent?: IntentContract;
      };
      if (!response.ok || !payload.intent) {
        throw new Error(
          errorMessage(payload, "The constraints could not be confirmed. Nothing was analysed."),
        );
      }
      setConfirmedIntent(payload.intent);
      setStep(3);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The constraints could not be confirmed. Nothing was analysed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addOfferFromText() {
    if (offerText.trim().length < 20) {
      setError("Paste at least a short offer document (20 characters or more).");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const upload = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          label: offerLabel.trim() || "Pasted offer document",
          text: offerText,
          kind: "offer_terms",
        }),
      });
      const uploadPayload = (await upload.json().catch(() => ({}))) as {
        document?: { id: string };
      };
      if (!upload.ok || !uploadPayload.document) {
        throw new Error(errorMessage(uploadPayload, "The document could not be stored."));
      }
      const extract = await fetch(`/api/documents/${uploadPayload.document.id}/extract`, {
        method: "POST",
      });
      const extractPayload = (await extract.json().catch(() => ({}))) as {
        offer?: Offer;
        injection?: { detected: boolean };
      };
      if (!extract.ok || !extractPayload.offer) {
        throw new Error(
          errorMessage(extractPayload, "The offer terms could not be extracted."),
        );
      }
      const added = toWizardOffer(extractPayload.offer);
      setOffers((current) => [added, ...current]);
      setSelected((current) => [...new Set([added.id, ...current])]);
      setOfferText("");
      setUploadOpen(false);
      if (extractPayload.injection?.detected) {
        setError(
          "The document contained instruction-like text. It was treated as untrusted data; review the extracted terms carefully.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The offer could not be added.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function analyseSelected() {
    if (!confirmedIntent || selected.length === 0) return;
    setBusy(true);
    setError(null);
    setAnalysisErrors([]);
    setAnalysisIds([]);
    const initial: Record<string, "queued" | "running" | "done" | "error"> = {};
    for (const id of selected) initial[id] = "queued";
    setAnalysisState(initial);

    const created: string[] = [];
    const failures: string[] = [];

    await Promise.all(
      selected.map(async (offerId) => {
        setAnalysisState((current) => ({ ...current, [offerId]: "running" }));
        try {
          const response = await fetch("/api/analyses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intentId: confirmedIntent.id, offerId }),
          });
          const payload = (await response.json().catch(() => ({}))) as {
            analysis?: { id: string };
          };
          if (!response.ok || !payload.analysis) {
            throw new Error(errorMessage(payload, "Analysis failed."));
          }
          created.push(payload.analysis.id);
          setAnalysisState((current) => ({ ...current, [offerId]: "done" }));
        } catch (caught) {
          failures.push(
            `${offers.find((offer) => offer.id === offerId)?.providerName ?? "Offer"}: ${
              caught instanceof Error ? caught.message : "Analysis failed."
            }`,
          );
          setAnalysisState((current) => ({ ...current, [offerId]: "error" }));
        }
      }),
    );

    setAnalysisIds(created);
    setAnalysisErrors(failures);
    setBusy(false);

    if (created.length === selected.length) {
      router.push(`/app/compare/${confirmedIntent.id}`);
    }
  }

  const stepLabel = ["Request", "Confirm constraints", "Choose offers"] as const;

  return (
    <Panel tone="raised" className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-ink">Comparison setup</span>
            <Badge tone={servConfigured ? "accent" : "caution"}>
              {servConfigured ? `SERV · ${servModel}` : "SERV not configured"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-faint">
            {stepLabel.map((label, index) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={
                    step === index + 1
                      ? "flex size-5 items-center justify-center rounded-full bg-accent text-[10px] text-raised"
                      : step > index + 1
                        ? "flex size-5 items-center justify-center rounded-full bg-accent-soft text-[10px] text-accent-strong"
                        : "flex size-5 items-center justify-center rounded-full border border-line bg-surface text-[10px] text-ink-faint"
                  }
                >
                  {step > index + 1 ? <Check className="size-3" /> : index + 1}
                </span>
                <span className={step === index + 1 ? "text-ink" : ""}>{label}</span>
                {index < stepLabel.length - 1 ? (
                  <span className="h-px w-4 bg-line" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        {error ? (
          <div className="mb-4">
            <InlineNotice tone="danger" title="Nothing was executed">
              {error}
            </InlineNotice>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <label htmlFor="request" className="text-[13px] font-medium text-ink">
              What should the assistant find?
            </label>
            <p className="mt-1 text-[12px] leading-5 text-ink-muted">
              Plain English. State the saving floor, contract limit, benefits to
              keep and what should happen when a term cannot be verified.
            </p>
            <textarea
              id="request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={6}
              className="mt-3 w-full rounded-xl border border-line bg-raised px-4 py-3 text-[13px] leading-6 text-ink focus:border-accent"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-faint">
              <span>{request.trim().length} characters · minimum 10</span>
              <span>Extraction is a live SERV call. The engine is not involved yet.</span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={extractConstraints}
                disabled={busy || request.trim().length < 10}
                className={buttonClass("primary")}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                {busy ? "SERV is reading the request…" : "Extract constraints with SERV"}
              </button>
              <span className="text-[11px] text-ink-faint">
                If SERV is unavailable, the request fails closed.
              </span>
            </div>

            <div className="mt-5 rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-ink">
                <ShieldCheck className="size-3.5 text-accent" />
                What SERV may do here
              </div>
              <p className="mt-1 text-[11px] leading-5 text-ink-muted">
                Turn the request into a draft intent contract. It cannot confirm it,
                change the household policy, or decide whether an offer passes.
              </p>
            </div>
          </div>
        ) : null}

        {step === 2 && intent ? (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium text-ink">Extracted contract</div>
                <p className="mt-1 max-w-[58ch] text-[12px] leading-5 text-ink-muted">
                  Edit the hard constraints if SERV misread the request. Confirming
                  creates a new intent version; no analysis can run before confirmation.
                </p>
              </div>
              <Badge tone={meta?.source === "serv" ? "accent" : "caution"}>
                {meta?.source === "serv" ? "SERV extraction" : "Labeled demo parser"}
              </Badge>
            </div>

            {meta?.warning ? (
              <div className="mt-3">
                <InlineNotice tone="caution" title="Extraction source">
                  {meta.warning}
                </InlineNotice>
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-[12px] text-ink-muted sm:col-span-2">
                Goal
                <input
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink focus:border-accent"
                />
              </label>
              <label className="block text-[12px] text-ink-muted">
                Minimum monthly saving (USD)
                <input
                  value={minSaving}
                  onChange={(event) => setMinSaving(event.target.value)}
                  inputMode="decimal"
                  placeholder="No floor"
                  className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink focus:border-accent"
                />
              </label>
              <label className="block text-[12px] text-ink-muted">
                Maximum contract (months)
                <input
                  value={maxTerm}
                  onChange={(event) => setMaxTerm(event.target.value)}
                  inputMode="numeric"
                  placeholder="No limit"
                  className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink focus:border-accent"
                />
              </label>
              <label className="block text-[12px] text-ink-muted">
                Unknown critical terms
                <select
                  value={unknownPolicy}
                  onChange={(event) =>
                    setUnknownPolicy(event.target.value as "review" | "block")
                  }
                  className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink focus:border-accent"
                >
                  <option value="review">Review — ask the household</option>
                  <option value="block">Block — refuse the offer</option>
                </select>
              </label>
              <div className="text-[12px] text-ink-muted">
                Extraction details
                <div className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] leading-5 text-ink-muted">
                  {meta?.source === "serv" ? "SERV" : "Demo parser"} · {meta?.model ?? "unknown"}
                  {meta?.latencyMs !== null && meta?.latencyMs !== undefined
                    ? ` · ${meta.latencyMs} ms`
                    : ""}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-[11px]">
              <div>
                <span className="font-medium text-ink">Keep benefits: </span>
                <span className="text-ink-muted">
                  {intent.mustKeepBenefits.length > 0
                    ? intent.mustKeepBenefits.join(", ")
                    : "None"}
                </span>
              </div>
              <div>
                <span className="font-medium text-ink">Must have: </span>
                <span className="text-ink-muted">
                  {intent.mustHave.length > 0 ? intent.mustHave.join(", ") : "None"}
                </span>
              </div>
              <div>
                <span className="font-medium text-ink">Must not have: </span>
                <span className="text-ink-muted">
                  {intent.mustNotHave.length > 0 ? intent.mustNotHave.join(", ") : "None"}
                </span>
              </div>
              {intent.ambiguities.length > 0 ? (
                <div>
                  <span className="font-medium text-caution">Ambiguities: </span>
                  <span className="text-ink-muted">{intent.ambiguities.join(" ")}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                className={buttonClass("ghost")}
              >
                <ArrowLeft className="size-4" />
                Edit request
              </button>
              <button
                type="button"
                onClick={confirmConstraints}
                disabled={busy || goal.trim().length === 0}
                className={buttonClass("primary")}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {busy ? "Confirming…" : "Confirm these constraints"}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && confirmedIntent ? (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-medium text-ink">
                  Choose offers to analyse
                </div>
                <p className="mt-1 max-w-[60ch] text-[12px] leading-5 text-ink-muted">
                  Confirmed intent v{confirmedIntent.version}. Each offer is analysed
                  independently; the decision is recomputed, not copied from a previous
                  run.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen((open) => !open)}
                className={buttonClass("quiet")}
              >
                <FileUp className="size-4" />
                Paste another offer
              </button>
            </div>

            {uploadOpen ? (
              <div className="mt-4 rounded-xl border border-line bg-surface p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <label className="block text-[11px] text-ink-muted">
                    Document label
                    <input
                      value={offerLabel}
                      onChange={(event) => setOfferLabel(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-[12px] text-ink focus:border-accent"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={addOfferFromText}
                      disabled={uploading}
                      className={buttonClass("secondary")}
                    >
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      {uploading ? "Extracting…" : "Add offer with SERV"}
                    </button>
                  </div>
                </div>
                <label className="mt-3 block text-[11px] text-ink-muted">
                  Offer document text
                  <textarea
                    value={offerText}
                    onChange={(event) => setOfferText(event.target.value)}
                    rows={5}
                    placeholder="Paste the full terms. Provider name, monthly price, promotion length, standard price, fees, term and benefits should be stated."
                    className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-[12px] leading-5 text-ink focus:border-accent"
                  />
                </label>
                <p className="mt-2 text-[10px] leading-4 text-ink-faint">
                  The document is treated as untrusted data. PDF parsing is not
                  enabled; paste text. Extraction uses SERV and the same evidence
                  validation as the seeded offers.
                </p>
              </div>
            ) : null}

            <ul className="mt-4 space-y-3">
              {offers.map((offer) => {
                const checked = selected.includes(offer.id);
                const state = analysisState[offer.id];
                return (
                  <li
                    key={offer.id}
                    className={
                      checked
                        ? "rounded-xl border border-accent/35 bg-surface p-4"
                        : "rounded-xl border border-line bg-surface p-4"
                    }
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelected((current) =>
                            event.target.checked
                              ? [...new Set([...current, offer.id])]
                              : current.filter((id) => id !== offer.id),
                          );
                        }}
                        disabled={busy}
                        className="mt-1 size-4"
                        aria-label={`Analyse ${offer.providerName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-medium text-ink">
                            {offer.providerName} — {offer.planName}
                          </span>
                          {offer.status === "needs_verification" ? (
                            <Badge tone="caution">Needs verification</Badge>
                          ) : (
                            <Badge tone="ok">Terms ready</Badge>
                          )}
                          {state === "running" ? (
                            <Badge tone="accent">
                              <Loader2 className="size-3 animate-spin" />
                              Analysing
                            </Badge>
                          ) : null}
                          {state === "done" ? (
                            <Badge tone="ok">
                              <Check className="size-3" />
                              Complete
                            </Badge>
                          ) : null}
                          {state === "error" ? (
                            <Badge tone="danger">Failed</Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[11px] text-ink-faint">
                          {offer.sourceLabel} · v{offer.offerVersion}
                        </div>
                        <div className="mt-2 grid gap-x-5 gap-y-1 text-[11px] text-ink-muted sm:grid-cols-2">
                          <div>
                            Advertised:{" "}
                            <span className="font-mono-num text-ink">
                              <Money minor={offer.promoPriceMinor} unknownLabel="Unknown" />
                            </span>
                            {offer.promoMonths ? ` for ${offer.promoMonths} months` : ""}
                          </div>
                          <div>
                            Standard:{" "}
                            <span className="font-mono-num text-ink">
                              <Money minor={offer.standardPriceMinor} unknownLabel="Not stated" />
                            </span>
                          </div>
                          <div>
                            Term:{" "}
                            <span className="text-ink">
                              {offer.minimumTermMonths === null
                                ? "Not stated"
                                : `${offer.minimumTermMonths} months`}
                            </span>
                          </div>
                          <div>
                            One-off fees:{" "}
                            <span className="text-ink">
                              {offer.installationFeeMinor === null
                                ? "Not stated"
                                : `$${(offer.installationFeeMinor / 100).toFixed(2)}`}
                            </span>
                          </div>
                        </div>
                        {offer.excludedBenefits.length > 0 ? (
                          <div className="mt-2 text-[11px] text-danger">
                            Loses: {offer.excludedBenefits.join(", ")}
                          </div>
                        ) : null}
                        {offer.unknowns.length > 0 ? (
                          <div className="mt-1 flex items-start gap-1.5 text-[11px] text-caution">
                            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                            {offer.unknowns.length} material unknown
                            {offer.unknowns.length === 1 ? "" : "s"} — the total will not be
                            presented as complete.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {analysisErrors.length > 0 ? (
              <div className="mt-4">
                <InlineNotice tone="danger" title="Some analyses did not run">
                  <ul className="list-disc space-y-1 pl-4">
                    {analysisErrors.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </InlineNotice>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep(2);
                  setError(null);
                }}
                className={buttonClass("ghost")}
                disabled={busy}
              >
                <ArrowLeft className="size-4" />
                Back to constraints
              </button>
              <div className="flex flex-wrap items-center gap-3">
                {analysisIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/app/compare/${confirmedIntent.id}`)
                    }
                    className={buttonClass("secondary")}
                  >
                    Open comparison
                    <ArrowRight className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={analyseSelected}
                  disabled={busy || selected.length === 0}
                  className={buttonClass("primary")}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  {busy
                    ? "Running the deterministic engine…"
                    : `Analyse ${selected.length} offer${selected.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-4 text-ink-faint">
              An analysis is a new immutable record. It produces a receipt and can be
              recalculated later against a newer ledger without rewriting this result.
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
