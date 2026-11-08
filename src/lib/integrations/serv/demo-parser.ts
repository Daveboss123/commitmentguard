import "server-only";
import type {
  OfferTerms,
  RenewalType,
  ServiceType,
} from "@/lib/domain/types";
import type { ServIntentOutput, ServOfferTermsOutput } from "@/lib/domain/schemas";

function dollarsToMinor(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function firstMoney(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  return match ? dollarsToMinor(match[1]) : null;
}

function findLine(text: string, pattern: RegExp): string | null {
  for (const line of text.split(/\r?\n/)) {
    if (pattern.test(line)) return line.trim();
  }
  return null;
}

export function demoParseIntent(input: {
  request: string;
  currency: string;
  knownBenefitKeys: string[];
}): ServIntentOutput {
  const request = input.request;
  const lower = request.toLowerCase();
  const serviceTypes: ServiceType[] = [];
  if (lower.includes("broadband") || lower.includes("internet")) {
    serviceTypes.push("broadband");
  }
  if (lower.includes("mobile") || lower.includes("phone")) {
    serviceTypes.push("mobile");
  }
  if (serviceTypes.length === 0) serviceTypes.push("broadband");

  const savingMatch = request.match(
    /(?:save|saving|cheaper)[^.$]{0,24}\$\s?([0-9]+(?:\.[0-9]{1,2})?)/i,
  );
  const minimumMonthlySavingMinor = savingMatch
    ? dollarsToMinor(savingMatch[1])
    : null;

  const monthsMatch = request.match(
    /(?:longer than|no more than|maximum|max|within|over|exceed(?:ing)?)\s+([0-9]{1,3})\s*months?/i,
  );
  const maxContractMonths = monthsMatch
    ? Number.parseInt(monthsMatch[1], 10)
    : null;

  const mustKeepBenefits: string[] = [];
  if (/family|bundle|discount/.test(lower)) {
    for (const key of input.knownBenefitKeys) {
      if (
        key.includes("family") ||
        key.includes("bundle") ||
        key.includes("discount")
      ) {
        mustKeepBenefits.push(key);
      }
    }
  }

  const mustHave: string[] = [];
  if (serviceTypes.includes("broadband")) mustHave.push("broadband");
  if (/unlimited|data allowance|data/.test(lower)) {
    mustHave.push("minimum_data_allowance");
  }

  const mustNotHave: string[] = [];
  if (/automatic|auto-?renew|lock|fixed.term renewal/.test(lower)) {
    mustNotHave.push("automatic_24_month_renewal");
  }

  const softPreferences: string[] = [];
  if (/router included|keep the router|equipment/.test(lower)) {
    softPreferences.push("router_included");
  }
  if (/installation|setup fee/.test(lower)) {
    softPreferences.push("lower_installation_fee");
  }

  const unknownCriticalTermsPolicy =
    /block if|cannot verify|can't verify|do not proceed unless|must verify/.test(lower)
      ? "review"
      : "review";

  return {
    goal:
      request
        .split(/(?<=[.!?])\s+/)
        .slice(0, 2)
        .join(" ")
        .trim() || "Compare household service commitments.",
    serviceTypes,
    currency: input.currency.toUpperCase(),
    minimumMonthlySavingMinor,
    maxContractMonths,
    mustKeepBenefits: [...new Set(mustKeepBenefits)],
    mustHave,
    mustNotHave,
    softPreferences,
    approvalRequiredFor: ["provider_switch", "new_contract", "payment"],
    unknownCriticalTermsPolicy,
    ambiguities: [
      "Deterministic demo parser used: verify the extracted constraints before relying on them.",
    ],
  };
}

interface ParsedFact {
  field: string;
  value: string | number | boolean | null;
  quote: string;
  status: "verified" | "unknown";
}

interface ParsedOffer {
  providerName: string | null;
  planName: string | null;
  terms: OfferTerms;
  facts: ParsedFact[];
  materialUnknowns: string[];
}

const MONEY_FIELDS: Array<{
  field: keyof OfferTerms;
  label: string;
  pattern: RegExp;
  linePattern: RegExp;
  unknownText: string;
}> = [
  {
    field: "promotionalMonthlyPriceMinor",
    label: "Monthly price",
    pattern: /monthly price[^$\n]*\$?\s?([0-9]+(?:\.[0-9]{1,2})?)/i,
    linePattern: /monthly price/i,
    unknownText: "Monthly price is not stated",
  },
  {
    field: "standardMonthlyPriceMinor",
    label: "Standard price",
    pattern: /standard price[^$\n]*\$?\s?([0-9]+(?:\.[0-9]{1,2})?)/i,
    linePattern: /standard price/i,
    unknownText: "Standard price after the promotion is not stated",
  },
  {
    field: "installationFeeMinor",
    label: "Installation fee",
    pattern: /installation fee[^$\n]*\$?\s?([0-9]+(?:\.[0-9]{1,2})?)/i,
    linePattern: /installation fee/i,
    unknownText: "Installation fee is not stated",
  },
  {
    field: "activationFeeMinor",
    label: "Activation fee",
    pattern: /activation fee[^$\n]*\$?\s?([0-9]+(?:\.[0-9]{1,2})?)/i,
    linePattern: /activation fee/i,
    unknownText: "Activation fee is not stated",
  },
  {
    field: "equipmentMonthlyFeeMinor",
    label: "Equipment rental",
    pattern: /(?:router rental|equipment)[^$\n]*\$?\s?([0-9]+(?:\.[0-9]{1,2})?)\s*per month/i,
    linePattern: /router (?:rental|included)|equipment/i,
    unknownText: "Equipment rental fee is not stated",
  },
  {
    field: "cancellationFeeMinor",
    label: "Early termination fee",
    pattern: /early termination fee[^$\n]*\$?\s?([0-9]+(?:\.[0-9]{1,2})?)/i,
    linePattern: /termination fee/i,
    unknownText: "Early termination charge is not stated",
  },
];

function parseRenewal(text: string): RenewalType {
  const line = findLine(text, /renewal/i)?.toLowerCase() ?? "";
  if (!line) return "unknown";
  if (line.includes("automatic")) return "automatic";
  if (line.includes("monthly")) return "monthly";
  if (line.includes("fixed")) return "fixed_term";
  return "unknown";
}

function parseTermLine(text: string): ParsedFact | null {
  const line = findLine(text, /contract term|minimum term/i);
  if (!line) {
    return {
      field: "minimumTermMonths",
      value: null,
      quote: "",
      status: "unknown",
    };
  }
  const months = line.match(/([0-9]{1,3})\s*months?/i);
  if (months) {
    return {
      field: "minimumTermMonths",
      value: Number.parseInt(months[1], 10),
      quote: line,
      status: "verified",
    };
  }
  if (/month-to-month|monthly/i.test(line)) {
    return { field: "minimumTermMonths", value: 0, quote: line, status: "verified" };
  }
  return { field: "minimumTermMonths", value: null, quote: line, status: "unknown" };
}

function parseFamilyRetention(
  text: string,
): { value: boolean | null; quote: string | null } {
  const line = findLine(text, /family mobile bundle|bundle discount/i);
  if (!line) return { value: null, quote: null };
  if (/does not preserve|not retained|removed|excluded|lost/i.test(line)) {
    return { value: false, quote: line };
  }
  if (/retained|preserved|kept|continues/i.test(line)) {
    return { value: true, quote: line };
  }
  return { value: null, quote: line };
}

function setMoneyField(
  terms: OfferTerms,
  field: (typeof MONEY_FIELDS)[number]["field"],
  value: number | null,
): void {
  switch (field) {
    case "promotionalMonthlyPriceMinor":
      terms.promotionalMonthlyPriceMinor = value;
      break;
    case "standardMonthlyPriceMinor":
      terms.standardMonthlyPriceMinor = value;
      break;
    case "installationFeeMinor":
      terms.installationFeeMinor = value;
      break;
    case "activationFeeMinor":
      terms.activationFeeMinor = value;
      break;
    case "equipmentMonthlyFeeMinor":
      terms.equipmentMonthlyFeeMinor = value;
      break;
    case "cancellationFeeMinor":
      terms.cancellationFeeMinor = value;
      break;
  }
}

export function demoParseOffer(input: {
  documentText: string;
  defaultCurrency: string;
}): ParsedOffer {
  const text = input.documentText;
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const header = firstLine.split(/\s+[—–-]\s+/);
  const providerName = (header[0] ?? "").replace(/\s*demo\s*/i, " Demo").trim() || null;
  const planName = (header[1] ?? "").trim() || null;

  const terms: OfferTerms = {
    providerName,
    planName,
    serviceType: /mobile/i.test(text) && !/broadband/i.test(text) ? "mobile" : "broadband",
    currency: /(?:US\$|\$|USD)/.test(text)
      ? "USD"
      : input.defaultCurrency.toUpperCase(),
    promotionalMonthlyPriceMinor: null,
    promotionalMonths: null,
    standardMonthlyPriceMinor: null,
    installationFeeMinor: null,
    activationFeeMinor: null,
    equipmentMonthlyFeeMinor: null,
    minimumTermMonths: null,
    renewalType: "unknown",
    cancellationFeeMinor: null,
    includedBenefits: [],
    excludedBenefits: [],
    dataAllowance: null,
    routerIncluded: null,
    familyBundleDiscountRetained: null,
    materialUnknowns: [],
  };

  const facts: ParsedFact[] = [];
  const materialUnknowns: string[] = [];

  for (const definition of MONEY_FIELDS) {
    const line = findLine(text, definition.linePattern);
    if (!line) {
      materialUnknowns.push(`${definition.unknownText} in the document`);
      setMoneyField(terms, definition.field, null);
      continue;
    }
    if (/not stated|not specified|n\/a|unavailable/i.test(line)) {
      facts.push({ field: definition.field, value: null, quote: line, status: "unknown" });
      setMoneyField(terms, definition.field, null);
      continue;
    }
    if (
      definition.field === "equipmentMonthlyFeeMinor" &&
      /included at no extra/i.test(line)
    ) {
      facts.push({ field: definition.field, value: 0, quote: line, status: "verified" });
      setMoneyField(terms, definition.field, 0);
      continue;
    }
    const value = firstMoney(line, definition.pattern);
    if (value === null) {
      materialUnknowns.push(`${definition.unknownText} in a machine-readable form`);
      continue;
    }
    facts.push({ field: definition.field, value, quote: line, status: "verified" });
    setMoneyField(terms, definition.field, value);
  }

  const promoLine = findLine(text, /promotional period|first [0-9]+ months/i);
  if (promoLine) {
    if (/none|no promotional/i.test(promoLine)) {
      facts.push({
        field: "promotionalMonths",
        value: 0,
        quote: promoLine,
        status: "verified",
      });
      terms.promotionalMonths = 0;
    } else {
      const months = promoLine.match(/([0-9]{1,2})\s*months?/i);
      if (months) {
        facts.push({
          field: "promotionalMonths",
          value: Number.parseInt(months[1], 10),
          quote: promoLine,
          status: "verified",
        });
        terms.promotionalMonths = Number.parseInt(months[1], 10);
      }
    }
  }

  const termFact = parseTermLine(text);
  if (termFact) {
    if (!termFact.quote) {
      materialUnknowns.push("Minimum contract term is not stated");
    } else {
      facts.push(termFact);
      terms.minimumTermMonths = termFact.value as number | null;
    }
  }

  const renewalLine = findLine(text, /renewal/i);
  terms.renewalType = parseRenewal(text);
  if (renewalLine && terms.renewalType !== "unknown") {
    facts.push({
      field: "renewalType",
      value: terms.renewalType,
      quote: renewalLine,
      status: "verified",
    });
  } else {
    materialUnknowns.push("Renewal behaviour after the initial term is not stated");
  }

  const dataLine = findLine(text, /data allowance/i);
  if (dataLine) {
    const value = dataLine.split(/data allowance:\s*/i)[1]?.replace(/\.$/, "").trim();
    if (value) {
      terms.dataAllowance = value;
      facts.push({
        field: "dataAllowance",
        value,
        quote: dataLine,
        status: "verified",
      });
    }
  }

  const routerLine = findLine(text, /router/i);
  if (routerLine) {
    if (/included at no extra|router included/i.test(routerLine)) {
      terms.routerIncluded = true;
      facts.push({
        field: "routerIncluded",
        value: true,
        quote: routerLine,
        status: "verified",
      });
    } else if (/rental|per month/i.test(routerLine)) {
      terms.routerIncluded = false;
      facts.push({
        field: "routerIncluded",
        value: false,
        quote: routerLine,
        status: "verified",
      });
    }
  }

  const family = parseFamilyRetention(text);
  if (family.quote) {
    facts.push({
      field: "familyBundleDiscountRetained",
      value: family.value,
      quote: family.quote,
      status: family.value === null ? "unknown" : "verified",
    });
    terms.familyBundleDiscountRetained = family.value;
    if (family.value === true) {
      terms.includedBenefits.push({
        key: "family_mobile_bundle_discount",
        description: "Northline family mobile bundle discount",
        valueMinor: null,
        evidenceId: null,
      });
    }
    if (family.value === false) {
      terms.excludedBenefits.push({
        key: "family_mobile_bundle_discount",
        description: "Northline family mobile bundle discount",
        valueMinor: null,
        evidenceId: null,
      });
    }
    if (family.value === null) {
      materialUnknowns.push("The family bundle impact is not addressed");
    }
  }

  terms.materialUnknowns = [...new Set(materialUnknowns)];

  const output: ServOfferTermsOutput = {
    providerName,
    planName,
    serviceType: terms.serviceType,
    currency: terms.currency,
    promotionalMonthlyPriceMinor: terms.promotionalMonthlyPriceMinor,
    promotionalMonths: terms.promotionalMonths,
    standardMonthlyPriceMinor: terms.standardMonthlyPriceMinor,
    installationFeeMinor: terms.installationFeeMinor,
    activationFeeMinor: terms.activationFeeMinor,
    equipmentMonthlyFeeMinor: terms.equipmentMonthlyFeeMinor,
    minimumTermMonths: terms.minimumTermMonths,
    renewalType: terms.renewalType,
    cancellationFeeMinor: terms.cancellationFeeMinor,
    includedBenefits: terms.includedBenefits.map((item) => ({
      key: item.key,
      description: item.description,
      valueMinor: item.valueMinor,
    })),
    excludedBenefits: terms.excludedBenefits.map((item) => ({
      key: item.key,
      description: item.description,
      valueMinor: item.valueMinor,
    })),
    dataAllowance: terms.dataAllowance,
    routerIncluded: terms.routerIncluded,
    familyBundleDiscountRetained: terms.familyBundleDiscountRetained,
    materialUnknowns: terms.materialUnknowns,
    extractedFacts: facts.map((fact) => ({
      field: fact.field,
      value: fact.value,
      exactQuote: fact.quote,
      page: 1,
      section: null,
    })),
  };

  return {
    providerName: output.providerName,
    planName: output.planName,
    terms,
    facts: facts.map((fact) => ({
      ...fact,
      value: fact.value,
    })),
    materialUnknowns: terms.materialUnknowns,
  };
}

export const demoParserModel = "deterministic-demo-parser";
