import "server-only";
import { randomUUID } from "node:crypto";
import type {
  Analysis,
  DemoDocument,
  Evidence,
  IntentContract,
  Offer,
  OfferTerms,
  UserPolicy,
} from "@/lib/domain/types";
import {
  ServIntentSchema,
  ServOfferTermsSchema,
  ServExplanationSchema,
  type ServIntentOutput,
  type ServOfferTermsOutput,
} from "@/lib/domain/schemas";
import { isServConfigured, serverConfig } from "@/lib/app/config";
import {
  ServUnavailableError,
  callServStructured,
  probeServ,
  type ServHealth,
} from "./client";
import {
  SERV_SAFETY_RULES,
  explanationPrompt,
  intentExtractionPrompt,
  offerExtractionPrompt,
} from "./prompts";
import { demoParseIntent, demoParseOffer, demoParserModel } from "./demo-parser";
import { hashPayload, shortHash } from "@/lib/domain/canonical";
import { sourceVersionHash, validateEvidence } from "@/lib/domain/evidence";
import { scanForInjection, type InjectionScan } from "@/lib/security/injection";
import { mutateDatabase, serverNow } from "@/lib/store/database";
import { appendAudit } from "@/lib/store/repository";

export interface ExtractionMeta {
  source: "serv" | "demo_parser";
  model: string;
  responseId: string | null;
  latencyMs: number | null;
  warning: string | null;
}

function policySummary(policy: UserPolicy | null): string {
  if (!policy) return "No stored policy.";
  return JSON.stringify({
    minimumMonthlySavingMinor: policy.minimumMonthlySavingMinor,
    maxContractMonths: policy.maxContractMonths,
    mustKeepBenefits: policy.mustKeepBenefits,
    mustHave: policy.mustHave,
    mustNotHave: policy.mustNotHave,
    unknownCriticalTermsPolicy: policy.unknownCriticalTermsPolicy,
    currency: policy.currency,
  });
}

export async function extractIntent(input: {
  householdId: string;
  request: string;
  policy: UserPolicy | null;
  knownBenefitKeys: string[];
  actorUserId: string;
}): Promise<{ intent: IntentContract; meta: ExtractionMeta }> {
  const now = serverNow();
  let parsed: ServIntentOutput;
  let meta: ExtractionMeta;

  if (isServConfigured()) {
    const result = await callServStructured({
      name: "trycommit_intent",
      system: SERV_SAFETY_RULES,
      user: intentExtractionPrompt({
        request: input.request,
        currency: input.policy?.currency ?? "USD",
        knownBenefitKeys: input.knownBenefitKeys,
        currentPolicy: policySummary(input.policy),
      }),
      schema: ServIntentSchema,
      maxCompletionTokens: 1200,
      temperature: 0,
    });
    parsed = result.data;
    meta = {
      source: "serv",
      model: result.model,
      responseId: result.responseId,
      latencyMs: result.latencyMs,
      warning: null,
    };
  } else {
    parsed = demoParseIntent({
      request: input.request,
      currency: input.policy?.currency ?? "USD",
      knownBenefitKeys: input.knownBenefitKeys,
    });
    meta = {
      source: "demo_parser",
      model: demoParserModel,
      responseId: null,
      latencyMs: null,
      warning:
        "SERV is not configured on this deployment. A deterministic demo parser produced this draft intent. It is labelled and still requires confirmation.",
    };
  }

  const intent: IntentContract = {
    id: `int_${randomUUID()}`,
    householdId: input.householdId,
    policyId: input.policy?.id ?? "pol_unset",
    version: 1,
    originalRequest: input.request,
    goal: parsed.goal,
    serviceTypes: parsed.serviceTypes,
    currency: parsed.currency,
    minimumMonthlySavingMinor: parsed.minimumMonthlySavingMinor,
    maxContractMonths: parsed.maxContractMonths,
    mustKeepBenefits: parsed.mustKeepBenefits,
    mustHave: parsed.mustHave,
    mustNotHave: parsed.mustNotHave,
    softPreferences: parsed.softPreferences,
    approvalRequiredFor: parsed.approvalRequiredFor,
    unknownCriticalTermsPolicy: parsed.unknownCriticalTermsPolicy,
    ambiguities: parsed.ambiguities,
    extractionModel: meta.model,
    extractionSource: meta.source,
    servRequestId: meta.responseId,
    servLatencyMs: meta.latencyMs,
    userConfirmedAt: null,
    createdAt: now,
  };

  await mutateDatabase((database) => {
    database.intents.push(intent);
    appendAudit(database, {
      householdId: input.householdId,
      actorType: "user",
      actorId: input.actorUserId,
      eventType: "intent.extracted",
      entityType: "intent",
      entityId: intent.id,
      metadata: {
        extractionSource: meta.source,
        model: meta.model,
        latencyMs: meta.latencyMs,
        servResponseId: meta.responseId,
      },
    });
  });

  return { intent, meta };
}

interface FactEvidenceInput {
  documentId: string;
  documentText: string;
  subjectId: string;
  fact: ServOfferTermsOutput["extractedFacts"][number];
}

function factToEvidence(input: FactEvidenceInput): Evidence | null {
  if (!input.fact.exactQuote?.trim()) return null;
  const normalizedValue =
    input.fact.value === undefined ? null : (input.fact.value as Evidence["normalizedValue"]);
  return {
    id: `ev_${shortHash(
      hashPayload({
        documentId: input.documentId,
        field: input.fact.field,
        quote: input.fact.exactQuote,
        value: normalizedValue,
      }),
      16,
    )}`,
    sourceType: "uploaded_document",
    sourceLabel: input.documentId,
    documentId: input.documentId,
    subjectId: input.subjectId,
    page: input.fact.page ?? undefined,
    section: input.fact.section ?? undefined,
    quote: input.fact.exactQuote,
    normalizedField: input.fact.field,
    normalizedValue,
    status:
      input.fact.value === null || input.fact.value === undefined
        ? "unknown"
        : "verified",
    extractedAt: serverNow(),
    sourceVersionHash: sourceVersionHash(input.documentText),
  };
}

function sanitizeTerms(input: {
  parsed: ServOfferTermsOutput;
  evidence: Evidence[];
  documentId: string;
  documentText: string;
}): { terms: OfferTerms; unknowns: string[] } {
  const validation = validateEvidence(input.evidence, {
    [input.documentId]: input.documentText,
  });
  const unknowns: string[] = [];

  const validFor = (field: string): Evidence | null => {
    const item = input.evidence.find(
      (candidate) => candidate.normalizedField === field,
    );
    if (!item) return null;
    if (!validation.byId[item.id]?.valid) return null;
    if (item.status === "unknown") return null;
    return item;
  };

  const money = (field: keyof OfferTerms, label: string): number | null => {
    const item = validFor(field as string);
    if (!item || typeof item.normalizedValue !== "number") {
      unknowns.push(`${label} could not be verified from the document`);
      return null;
    }
    return item.normalizedValue;
  };

  const termItem = validFor("minimumTermMonths");
  const termMonths =
    termItem && typeof termItem.normalizedValue === "number"
      ? termItem.normalizedValue
      : null;
  if (termMonths === null) unknowns.push("Minimum contract term is unknown");

  const renewalItem = validFor("renewalType");
  const renewalType =
    renewalItem && typeof renewalItem.normalizedValue === "string"
      ? (renewalItem.normalizedValue as OfferTerms["renewalType"])
      : "unknown";
  if (renewalType === "unknown") unknowns.push("Renewal behaviour is unknown");

  const dataItem = validFor("dataAllowance");
  const routerItem = validFor("routerIncluded");
  const familyItem = validFor("familyBundleDiscountRetained");
  const familyValue =
    familyItem && typeof familyItem.normalizedValue === "boolean"
      ? familyItem.normalizedValue
      : null;
  if (familyValue === null) {
    unknowns.push("Whether the family bundle discount is retained is unknown");
  }

  const excluded = input.parsed.excludedBenefits
    .map((benefit) => {
      const item = validFor(`excludedBenefit:${benefit.key}`);
      return item
        ? { ...benefit, evidenceId: item.id }
        : { ...benefit, evidenceId: null };
    })
    .filter((benefit) => benefit.evidenceId !== null);
  const included = input.parsed.includedBenefits
    .map((benefit) => {
      const item = validFor(`includedBenefit:${benefit.key}`);
      return item
        ? { ...benefit, evidenceId: item.id }
        : { ...benefit, evidenceId: null };
    })
    .filter((benefit) => benefit.evidenceId !== null);

  return {
    terms: {
      providerName: input.parsed.providerName,
      planName: input.parsed.planName,
      serviceType: input.parsed.serviceType,
      currency: input.parsed.currency,
      promotionalMonthlyPriceMinor: money(
        "promotionalMonthlyPriceMinor",
        "Monthly price",
      ),
      promotionalMonths:
        validFor("promotionalMonths") &&
        typeof validFor("promotionalMonths")!.normalizedValue === "number"
          ? (validFor("promotionalMonths")!.normalizedValue as number)
          : null,
      standardMonthlyPriceMinor: money(
        "standardMonthlyPriceMinor",
        "Standard monthly price",
      ),
      installationFeeMinor: money("installationFeeMinor", "Installation fee"),
      activationFeeMinor: money("activationFeeMinor", "Activation fee"),
      equipmentMonthlyFeeMinor: money(
        "equipmentMonthlyFeeMinor",
        "Equipment rental fee",
      ),
      minimumTermMonths: termMonths,
      renewalType,
      cancellationFeeMinor: money(
        "cancellationFeeMinor",
        "Early termination charge",
      ),
      includedBenefits: included,
      excludedBenefits: excluded,
      dataAllowance:
        dataItem && typeof dataItem.normalizedValue === "string"
          ? dataItem.normalizedValue
          : null,
      routerIncluded:
        routerItem && typeof routerItem.normalizedValue === "boolean"
          ? routerItem.normalizedValue
          : null,
      familyBundleDiscountRetained: familyValue,
      materialUnknowns: [...new Set([...input.parsed.materialUnknowns, ...unknowns])],
    },
    unknowns: [...new Set([...input.parsed.materialUnknowns, ...unknowns])],
  };
}

export interface OfferExtractionResult {
  offer: Offer;
  meta: ExtractionMeta;
  injection: InjectionScan;
}

interface OfferExtractionCore {
  terms: OfferTerms;
  facts: Offer["facts"];
  evidence: Evidence[];
  unknowns: string[];
  meta: ExtractionMeta;
  injection: InjectionScan;
}

/**
 * Pure-ish extraction step: SERV (or the labelled demo parser) plus quote
 * validation. Persistence is handled by the callers so both first extraction
 * and re-extraction share exactly the same safety checks.
 */
async function extractOfferCore(input: {
  documentId: string;
  documentLabel: string;
  documentText: string;
  defaultCurrency: string;
  knownBenefitKeys: string[];
  subjectId: string;
  forceManualParser?: boolean;
}): Promise<OfferExtractionCore> {
  const injection = scanForInjection(input.documentText);
  let parsed: ServOfferTermsOutput;
  let meta: ExtractionMeta;

  if (isServConfigured() && !input.forceManualParser) {
    const result = await callServStructured({
      name: "trycommit_offer_terms",
      system: SERV_SAFETY_RULES,
      user: offerExtractionPrompt({
        documentLabel: input.documentLabel,
        documentText: input.documentText,
        knownBenefitKeys: input.knownBenefitKeys,
      }),
      schema: ServOfferTermsSchema,
      maxCompletionTokens: 2400,
      temperature: 0,
    });
    parsed = result.data;
    meta = {
      source: "serv",
      model: result.model,
      responseId: result.responseId,
      latencyMs: result.latencyMs,
      warning: injection.detected
        ? "Potential prompt-injection text was detected in the document and ignored as data."
        : null,
    };
  } else {
    const deterministic = demoParseOffer({
      documentText: input.documentText,
      defaultCurrency: input.defaultCurrency,
    });
    parsed = {
      providerName: deterministic.providerName,
      planName: deterministic.planName,
      serviceType: deterministic.terms.serviceType,
      currency: deterministic.terms.currency,
      promotionalMonthlyPriceMinor:
        deterministic.terms.promotionalMonthlyPriceMinor,
      promotionalMonths: deterministic.terms.promotionalMonths,
      standardMonthlyPriceMinor: deterministic.terms.standardMonthlyPriceMinor,
      installationFeeMinor: deterministic.terms.installationFeeMinor,
      activationFeeMinor: deterministic.terms.activationFeeMinor,
      equipmentMonthlyFeeMinor:
        deterministic.terms.equipmentMonthlyFeeMinor,
      minimumTermMonths: deterministic.terms.minimumTermMonths,
      renewalType: deterministic.terms.renewalType,
      cancellationFeeMinor: deterministic.terms.cancellationFeeMinor,
      includedBenefits: deterministic.terms.includedBenefits,
      excludedBenefits: deterministic.terms.excludedBenefits,
      dataAllowance: deterministic.terms.dataAllowance,
      routerIncluded: deterministic.terms.routerIncluded,
      familyBundleDiscountRetained:
        deterministic.terms.familyBundleDiscountRetained,
      materialUnknowns: deterministic.terms.materialUnknowns,
      extractedFacts: deterministic.facts.map((fact) => ({
        field: fact.field,
        value: fact.value,
        exactQuote: fact.quote,
        page: 1,
        section: null,
      })),
    };
    meta = {
      source: "demo_parser",
      model: demoParserModel,
      responseId: null,
      latencyMs: null,
      warning:
        "SERV is not configured. A deterministic demo parser extracted these terms. Every quote is still validated against the document.",
    };
  }

  const evidence = parsed.extractedFacts
    .map((fact) =>
      factToEvidence({
        documentId: input.documentId,
        documentText: input.documentText,
        subjectId: input.subjectId,
        fact,
      }),
    )
    .filter((item): item is Evidence => item !== null);

  const sanitized = sanitizeTerms({
    parsed,
    evidence,
    documentId: input.documentId,
    documentText: input.documentText,
  });

  const facts = parsed.extractedFacts.map((fact) => {
    const item = evidence.find(
      (candidate) => candidate.normalizedField === fact.field,
    );
    const valid = item
      ? validateEvidence([item], { [input.documentId]: input.documentText })
          .byId[item.id]?.valid
      : false;
    return {
      field: fact.field,
      label: fact.field,
      value: valid ? (fact.value ?? null) : null,
      evidenceId: item?.id ?? null,
      status: (valid ? "verified" : "unknown") as "verified" | "unknown",
    };
  });

  return {
    terms: sanitized.terms,
    facts,
    evidence,
    unknowns: sanitized.unknowns,
    meta,
    injection,
  };
}

export async function extractOfferFromDocument(input: {
  householdId: string;
  document: DemoDocument;
  defaultCurrency: string;
  knownBenefitKeys: string[];
  actorUserId: string;
  forceManualParser?: boolean;
}): Promise<OfferExtractionResult> {
  const offerId = `offer_${randomUUID()}`;
  const core = await extractOfferCore({
    documentId: input.document.id,
    documentLabel: input.document.label,
    documentText: input.document.text,
    defaultCurrency: input.defaultCurrency,
    knownBenefitKeys: input.knownBenefitKeys,
    subjectId: offerId,
    forceManualParser: input.forceManualParser,
  });

  const now = serverNow();
  const offer: Offer = {
    id: offerId,
    householdId: input.householdId,
    providerName:
      core.terms.providerName ??
      input.document.label.split("—")[0]?.trim() ??
      "Unknown provider",
    planName: core.terms.planName ?? "Unnamed plan",
    serviceType: core.terms.serviceType,
    currency: core.terms.currency ?? input.defaultCurrency,
    sourceType: "uploaded_document",
    sourceLabel: input.document.label,
    offerVersion: 1,
    rawDocumentId: input.document.id,
    documentText: input.document.text,
    terms: core.terms,
    facts: core.facts,
    evidence: core.evidence,
    extractionSource: core.meta.source === "serv" ? "serv" : "demo_parser",
    status: core.unknowns.length > 0 ? "needs_verification" : "ready",
    createdAt: now,
    updatedAt: now,
  };

  await mutateDatabase((database) => {
    database.offers.push(offer);
    database.evidence.push(...core.evidence);
    appendAudit(database, {
      householdId: input.householdId,
      actorType: "user",
      actorId: input.actorUserId,
      eventType: "offer.extracted",
      entityType: "offer",
      entityId: offer.id,
      metadata: {
        extractionSource: core.meta.source,
        model: core.meta.model,
        servResponseId: core.meta.responseId,
        latencyMs: core.meta.latencyMs,
        injectionDetected: core.injection.detected,
        unknownCount: core.unknowns.length,
        documentId: input.document.id,
      },
    });
  });

  return { offer, meta: core.meta, injection: core.injection };
}

/**
 * Re-extracts the terms of an existing offer. Every call bumps offerVersion,
 * which deterministically invalidates approvals bound to the previous version.
 */
export async function reextractOfferTerms(input: {
  offer: Offer;
  knownBenefitKeys: string[];
  actorUserId: string;
  forceManualParser?: boolean;
}): Promise<OfferExtractionResult> {
  const documentId = input.offer.rawDocumentId ?? `offer_doc_${input.offer.id}`;
  const core = await extractOfferCore({
    documentId,
    documentLabel: input.offer.sourceLabel,
    documentText: input.offer.documentText,
    defaultCurrency: input.offer.currency,
    knownBenefitKeys: input.knownBenefitKeys,
    subjectId: input.offer.id,
    forceManualParser: input.forceManualParser,
  });

  return mutateDatabase((database) => {
    const stored = database.offers.find((item) => item.id === input.offer.id);
    if (!stored) throw new Error("Offer disappeared during re-extraction");
    const previousVersion = stored.offerVersion;
    stored.offerVersion += 1;
    stored.terms = core.terms;
    stored.facts = core.facts;
    stored.evidence = core.evidence;
    stored.providerName = core.terms.providerName ?? stored.providerName;
    stored.planName = core.terms.planName ?? stored.planName;
    stored.serviceType = core.terms.serviceType;
    stored.currency = core.terms.currency ?? stored.currency;
    stored.status = core.unknowns.length > 0 ? "needs_verification" : "ready";
    stored.updatedAt = serverNow();
    const existingIds = new Set(database.evidence.map((item) => item.id));
    database.evidence.push(
      ...core.evidence.filter((item) => !existingIds.has(item.id)),
    );
    appendAudit(database, {
      householdId: stored.householdId,
      actorType: "user",
      actorId: input.actorUserId,
      eventType: "offer.terms_reextracted",
      entityType: "offer",
      entityId: stored.id,
      metadata: {
        previousVersion,
        offerVersion: stored.offerVersion,
        extractionSource: core.meta.source,
        model: core.meta.model,
        injectionDetected: core.injection.detected,
        unknownCount: core.unknowns.length,
      },
    });
    return {
      offer: { ...stored },
      meta: core.meta,
      injection: core.injection,
    };
  });
}

export interface ServExplanationResult {
  analysis: Analysis;
  meta: ExtractionMeta;
}

export async function explainAnalysis(input: {
  analysis: Analysis;
  intent: IntentContract;
  offer: Offer;
  actorUserId: string;
}): Promise<ServExplanationResult> {
  if (!isServConfigured()) {
    throw new ServUnavailableError(
      "SERV is not configured. A plain-language explanation cannot be generated. No action was taken.",
    );
  }

  const evidence = [
    ...input.offer.evidence,
    ...input.analysis.decisionReasons.flatMap((reason) => reason.evidenceIds),
  ];
  const allowedEvidenceIds = [...new Set(input.offer.evidence.map((item) => item.id))];
  const evidenceText = input.offer.evidence
    .map(
      (item) =>
        `${item.id} | ${item.normalizedField ?? "fact"} | ${String(
          item.normalizedValue,
        )} | "${item.quote}"`,
    )
    .join("\n");
  const explanationInput = explanationPrompt({
    decision: input.analysis.decision,
    reasons: input.analysis.decisionReasons.map(
      (reason) => `${reason.code}: ${reason.title} — ${reason.detail}`,
    ),
    currentSummary: JSON.stringify({
      current12Minor: input.analysis.totals.current12.totalMinor,
      current24Minor: input.analysis.totals.current24.totalMinor,
    }),
    proposedSummary: JSON.stringify(input.offer.terms),
    totals: JSON.stringify({
      proposed12Minor: input.analysis.totals.proposed12.totalMinor,
      proposed24Minor: input.analysis.totals.proposed24.totalMinor,
      delta12Minor: input.analysis.totals.delta12Minor,
      delta24Minor: input.analysis.totals.delta24Minor,
      savings12Minor: input.analysis.totals.savings12Minor,
    }),
    consequences: input.analysis.consequences
      .map(
        (item) =>
          `${item.category} | ${item.title} | ${item.description} | ${item.status}`,
      )
      .join("\n"),
    evidence: evidenceText,
    unknowns: input.analysis.unknowns,
    allowedEvidenceIds,
  });

  const result = await callServStructured({
    name: "trycommit_explanation",
    system: SERV_SAFETY_RULES,
    user: explanationInput,
    schema: ServExplanationSchema,
    maxCompletionTokens: 1200,
    temperature: 0.2,
  });

  // Reject references to evidence that was not supplied to SERV.
  const referenced = result.data.evidenceIds.filter((id) =>
    allowedEvidenceIds.includes(id),
  );
  if (result.data.evidenceIds.length > 0 && referenced.length === 0) {
    throw new ServUnavailableError(
      "SERV cited evidence outside the supplied set. The explanation was rejected.",
    );
  }

  const servExplanation = {
    summary: result.data.summary,
    materialChanges: result.data.materialChanges,
    tradeoffs: result.data.tradeoffs,
    followUpQuestions: result.data.followUpQuestions,
    evidenceIds: referenced,
    confidenceExplanation: result.data.confidenceExplanation,
    model: result.model,
    responseId: result.responseId,
    latencyMs: result.latencyMs,
  };

  await mutateDatabase((database) => {
    const stored = database.analyses.find((item) => item.id === input.analysis.id);
    if (stored) stored.servExplanation = servExplanation;
    appendAudit(database, {
      householdId: input.analysis.householdId,
      actorType: "user",
      actorId: input.actorUserId,
      eventType: "analysis.explained",
      entityType: "analysis",
      entityId: input.analysis.id,
      metadata: {
        model: result.model,
        servResponseId: result.responseId,
        latencyMs: result.latencyMs,
        evidenceCount: evidence.length,
      },
    });
  });

  return {
    analysis: { ...input.analysis, servExplanation },
    meta: {
      source: "serv",
      model: result.model,
      responseId: result.responseId,
      latencyMs: result.latencyMs,
      warning: null,
    },
  };
}

export async function getServStatus(probe = false): Promise<ServHealth> {
  if (probe) return probeServ();
  return {
    configured: isServConfigured(),
    enabled: serverConfig.serv.enabled,
    model: serverConfig.serv.model,
    baseUrl: serverConfig.serv.baseUrl,
    reachable: null,
    latencyMs: null,
    responseId: null,
    checkedAt: new Date().toISOString(),
    error: null,
  };
}
