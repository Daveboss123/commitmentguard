import "server-only";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { DemoDocument, Offer } from "@/lib/domain/types";
import { sourceVersionHash } from "@/lib/domain/evidence";
import { mutateDatabase, serverNow } from "@/lib/store/database";
import { appendAudit } from "@/lib/store/repository";
import { ApiError } from "@/lib/http/errors";
import { serverConfig } from "@/lib/app/config";
import {
  extractOfferFromDocument,
  type ExtractionMeta,
} from "@/lib/integrations/serv/service";
import type { InjectionScan } from "@/lib/security/injection";
import { getDocument, getPolicy } from "@/lib/store/repository";

export interface CreateDocumentInput {
  householdId: string;
  label: string;
  text: string;
  kind: DemoDocument["kind"];
  actorUserId: string;
  sourceType?: "uploaded_document" | "public_url";
}

export async function createDocument(
  input: CreateDocumentInput,
): Promise<DemoDocument> {
  const text = input.text.trim();
  if (text.length < 20) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Document text is too short to extract terms safely.",
    );
  }
  if (Buffer.byteLength(text, "utf8") > serverConfig.uploadMaxBytes) {
    throw new ApiError(
      "DOCUMENT_TOO_LARGE",
      `The document exceeds the ${serverConfig.uploadMaxBytes} byte upload limit.`,
    );
  }

  const document: DemoDocument = {
    id: `doc_${randomUUID()}`,
    householdId: input.householdId,
    label: input.label,
    kind: input.kind,
    text,
    sourceVersionHash: sourceVersionHash(text),
    createdAt: serverNow(),
  };

  await mutateDatabase((database) => {
    database.documents.push(document);
    appendAudit(database, {
      householdId: input.householdId,
      actorType: "user",
      actorId: input.actorUserId,
      eventType: "document.created",
      entityType: "document",
      entityId: document.id,
      metadata: {
        label: document.label,
        kind: document.kind,
        bytes: Buffer.byteLength(text, "utf8"),
        sourceType: input.sourceType ?? "uploaded_document",
        sourceVersionHash: document.sourceVersionHash,
      },
    });
  });

  return document;
}

function isPrivateAddress(address: string): boolean {
  if (address === "::1" || address === "::") return true;
  if (address.startsWith("fc") || address.startsWith("fd")) return true;
  if (address.startsWith("fe80")) return true;
  if (address.startsWith("127.") || address.startsWith("10.")) return true;
  if (address.startsWith("192.168.")) return true;
  if (address.startsWith("169.254.")) return true;
  const match = /^172\.(\d{1,3})\./.exec(address);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return false;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Fetches a public text/HTML document. This endpoint is deliberately narrow:
 * no credentials, no private addresses, no redirects, no binary parsing.
 */
export async function fetchDocumentFromUrl(input: {
  householdId: string;
  label?: string;
  url: string;
  kind: DemoDocument["kind"];
  actorUserId: string;
}): Promise<DemoDocument> {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new ApiError("URL_NOT_ALLOWED", "The URL is not valid.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ApiError("URL_NOT_ALLOWED", "Only http and https URLs are accepted.");
  }
  if (parsed.username || parsed.password) {
    throw new ApiError("URL_NOT_ALLOWED", "URLs with embedded credentials are refused.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home")
  ) {
    throw new ApiError("URL_NOT_ALLOWED", "Private network hosts are not fetched.");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && isPrivateAddress(hostname)) {
    throw new ApiError("URL_NOT_ALLOWED", "Private network addresses are not fetched.");
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new ApiError("URL_NOT_ALLOWED", "The host resolves to a private address.");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("URL_NOT_ALLOWED", "The host could not be resolved.");
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: "text/html, text/plain, text/markdown;q=0.9",
        "User-Agent": "CommitmentGuardDemo/0.1 (illustrative demo fetch)",
      },
    });
  } catch {
    throw new ApiError("DOCUMENT_PARSE_FAILED", "The document could not be fetched.");
  }

  if (response.status >= 300 && response.status < 400) {
    throw new ApiError(
      "URL_NOT_ALLOWED",
      "Redirects are refused so a public URL cannot bounce to a private host.",
    );
  }
  if (!response.ok) {
    throw new ApiError(
      "DOCUMENT_PARSE_FAILED",
      `The document fetch returned status ${response.status}.`,
    );
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (
    contentType &&
    !contentType.includes("text/") &&
    !contentType.includes("html") &&
    !contentType.includes("markdown")
  ) {
    throw new ApiError(
      "DOCUMENT_PARSE_FAILED",
      "Only text, HTML and markdown documents can be fetched. PDF parsing is not enabled in this build.",
    );
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > serverConfig.uploadMaxBytes) {
    throw new ApiError("DOCUMENT_TOO_LARGE", "The remote document is too large.");
  }

  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > serverConfig.uploadMaxBytes) {
    throw new ApiError("DOCUMENT_TOO_LARGE", "The remote document is too large.");
  }

  const text = contentType.includes("html") ? htmlToText(raw) : raw.trim();
  if (text.length < 20) {
    throw new ApiError(
      "DOCUMENT_PARSE_FAILED",
      "The fetched page did not contain enough readable text.",
    );
  }

  return createDocument({
    householdId: input.householdId,
    label: input.label ?? `Fetched: ${parsed.hostname}${parsed.pathname}`,
    text,
    kind: input.kind,
    actorUserId: input.actorUserId,
    sourceType: "public_url",
  });
}

export interface OfferCreationResult {
  offer: Offer;
  document: DemoDocument;
  meta: ExtractionMeta;
  injection: InjectionScan;
}

export async function createOfferFromDocument(input: {
  householdId: string;
  documentId: string;
  actorUserId: string;
}): Promise<OfferCreationResult> {
  const document = await getDocument(input.documentId);
  if (!document) throw new ApiError("NOT_FOUND", "Document not found.");
  if (document.householdId !== input.householdId) {
    throw new ApiError("HOUSEHOLD_ACCESS_DENIED", "That document belongs to another household.");
  }
  const policy = await getPolicy(input.householdId);
  const knownBenefitKeys = [
    "family_mobile_bundle_discount",
    "streaming_credit",
  ];
  const result = await extractOfferFromDocument({
    householdId: input.householdId,
    document,
    defaultCurrency: policy?.currency ?? "USD",
    knownBenefitKeys,
    actorUserId: input.actorUserId,
  });
  // If SERV is configured but fails, the extraction throws and this function
  // fails closed. No offer is created from assumed values.
  return { ...result, document };
}

export async function createOfferFromText(input: {
  householdId: string;
  providerName: string;
  planName: string;
  serviceType: Offer["serviceType"];
  currency: string;
  documentText: string;
  sourceLabel: string;
  actorUserId: string;
}): Promise<OfferCreationResult> {
  const document = await createDocument({
    householdId: input.householdId,
    label: input.sourceLabel,
    text: input.documentText,
    kind: "offer_terms",
    actorUserId: input.actorUserId,
  });
  const result = await createOfferFromDocument({
    householdId: input.householdId,
    documentId: document.id,
    actorUserId: input.actorUserId,
  });
  return result;
}
