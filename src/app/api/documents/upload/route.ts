import type { NextRequest } from "next/server";
import { UploadDocumentRequestSchema } from "@/lib/domain/schemas";
import { requireWritableHousehold } from "@/lib/store/repository";
import { createDocument } from "@/lib/services/document.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";
import { serverConfig } from "@/lib/app/config";


export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const householdId = String(form.get("householdId") ?? "");
      const label = String(form.get("label") ?? "").trim();
      const kindRaw = String(form.get("kind") ?? "offer_terms");
      const file = form.get("file");
      if (!householdId || !label || !(file instanceof File)) {
        throw new ApiError(
          "VALIDATION_FAILED",
          "householdId, label and a file are required.",
        );
      }
      const access = await requireWritableHousehold(householdId);
      if (file.size > serverConfig.uploadMaxBytes) {
        throw new ApiError(
          "DOCUMENT_TOO_LARGE",
          `The file exceeds the ${serverConfig.uploadMaxBytes} byte limit.`,
        );
      }
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        throw new ApiError(
          "DOCUMENT_PARSE_FAILED",
          "PDF parsing is not enabled in this build. Upload the document as text, markdown or HTML, or paste the terms.",
        );
      }
      const text = (await file.text()).trim();
      const document = await createDocument({
        householdId,
        label,
        text,
        kind:
          kindRaw === "current_terms" || kindRaw === "demo_note"
            ? kindRaw
            : "offer_terms",
        actorUserId: access.session.userId,
      });
      return jsonResponse({ document }, 201);
    }

    const payload = (await request.json().catch(() => null)) as unknown;
    const parsed = UploadDocumentRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_FAILED", "Request validation failed.", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "body",
          message: issue.message,
        })),
      });
    }
    const access = await requireWritableHousehold(parsed.data.householdId);
    const document = await createDocument({
      householdId: parsed.data.householdId,
      label: parsed.data.label,
      text: parsed.data.text,
      kind: parsed.data.kind,
      actorUserId: access.session.userId,
    });
    return jsonResponse({ document }, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
