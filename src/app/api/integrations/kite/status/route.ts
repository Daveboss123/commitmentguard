import { getKiteStatus } from "@/lib/services/execution.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";


export async function GET() {
  try {
    return jsonResponse(await getKiteStatus());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
