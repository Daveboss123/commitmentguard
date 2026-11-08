import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET() {
  await connection();
  try {
    const session = await getSession();
    return jsonResponse({ authenticated: Boolean(session), session });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
