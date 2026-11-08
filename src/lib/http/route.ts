import "server-only";
import type { z } from "zod";
import { ApiError } from "./errors";

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_FAILED", "Request validation failed.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join(".") || "body",
        message: issue.message,
      })),
    });
  }
  return parsed.data as z.infer<T>;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function getSearchParam(request: Request, key: string): string | null {
  return new URL(request.url).searchParams.get(key);
}
