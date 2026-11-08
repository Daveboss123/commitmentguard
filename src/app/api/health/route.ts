import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";
import { getStorageDriver } from "@/lib/store/database";
import { getServStatus } from "@/lib/integrations/serv/service";
import { getKiteStatus } from "@/lib/services/execution.service";


export async function GET() {
  try {
    const [serv, kite] = await Promise.all([
      getServStatus(false),
      getKiteStatus().catch(() => ({
        mode: "unavailable" as const,
        executionMode: "simulated" as const,
        state: "unavailable" as const,
        note: "Kite status could not be read.",
      })),
    ]);
    return jsonResponse({
      ok: true,
      checkedAt: new Date().toISOString(),
      storage: getStorageDriver(),
      serv: { configured: serv.configured, enabled: serv.enabled, model: serv.model },
      kite: {
        mode: kite.mode,
        executionMode: kite.executionMode,
        state: kite.state,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
