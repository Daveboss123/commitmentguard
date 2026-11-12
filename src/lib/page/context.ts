import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requirePageSession } from "@/lib/auth/session";
import { getHousehold, getMemberForSession } from "@/lib/store/repository";

export async function getPageContext() {
  // Session decoding reads the wall clock to check expiry. Prerendering must
  // stop before that read, so every page that resolves a household is rendered
  // against a real request rather than a cached shell.
  await connection();
  const session = await requirePageSession();
  const household = await getHousehold(session.householdId);
  if (!household) redirect("/login");
  const member = await getMemberForSession(session);
  return { session, household, member };
}
