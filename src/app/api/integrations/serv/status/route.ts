import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { getServStatus } from "@/lib/integrations/serv/service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse, getSearchParam } from "@/lib/http/route";


export async function GET(request: NextRequest) {
  await connection();
  try {
    const probe = getSearchParam(request, "probe") === "1";
    return jsonResponse(await getServStatus(probe));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
