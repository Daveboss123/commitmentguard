import type { NextRequest } from "next/server";
import { simulateKiteApproval } from "@/lib/services/execution.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

/**
 * Local-demo only: approves the mock Kite session. On a real CLI session the
 * service refuses and asks the user to approve with their Passport passkey.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return jsonResponse({ execution: await simulateKiteApproval(id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
