import "server-only";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/session";
import { getHousehold, getMemberForSession } from "@/lib/store/repository";

export async function getPageContext() {
  const session = await requirePageSession();
  const household = await getHousehold(session.householdId);
  if (!household) redirect("/login");
  const member = await getMemberForSession(session);
  return { session, household, member };
}
