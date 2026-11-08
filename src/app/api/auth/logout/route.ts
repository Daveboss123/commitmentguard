import type { NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";


export async function POST(request: NextRequest) {
  await clearSessionCookie();
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/login", "Cache-Control": "no-store" },
    });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
