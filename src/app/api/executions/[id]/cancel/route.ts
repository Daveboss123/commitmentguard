import type { NextRequest } from "next/server";
import { cancelExecution } from "@/lib/services/execution.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return jsonResponse({ execution: await cancelExecution(id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
