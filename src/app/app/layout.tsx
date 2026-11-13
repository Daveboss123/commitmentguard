import { AppNav } from "@/components/app-nav";
import { getPageContext } from "@/lib/page/context";

/**
 * Every route in this segment is authenticated and personalised, and the shared
 * layout reads the session cookie. A cached static shell would either leak one
 * household's chrome to another or be empty, so blocking navigation is the
 * honest choice here. Public pages keep their own prerendered shells.
 */
export const instant = false;

export const metadata = {
  title: "Workspace",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { household, member } = await getPageContext();

  return (
    <div className="flex min-h-dvh flex-col bg-paper lg:flex-row">
      <a href="#main-content" className="sr-only z-[60] bg-raised px-4 py-3 text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <AppNav
        householdName={household.name}
        memberName={member?.displayName ?? "Household owner"}
        role={member?.role ?? "owner"}
      />
      <main id="main-content" className="min-w-0 flex-1 px-5 pb-16 pt-8 sm:px-8 lg:px-10 lg:pt-10">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
