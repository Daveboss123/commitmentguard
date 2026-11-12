import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge, InlineNotice, Panel } from "@/components/ui";
import { buttonClass } from "@/components/button";
import { brand, demoLabels } from "@/lib/brand";
import { getSession } from "@/lib/auth/session";
import { DEMO_HOUSEHOLD_ID, DEMO_USER_ID } from "@/lib/fixtures/demo";

export const metadata: Metadata = {
  title: "Demo sign-in",
  description: "Enter the CommitmentGuard demo workspace.",
};

/**
 * Sign-in reads the session cookie to redirect an already-authenticated visitor
 * and reads searchParams for an error state, so it renders per request rather
 * than as a shared static shell.
 */
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/app");
  const { error } = await searchParams;

  return (
    <div className="paper-grid flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <BrandMark />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back to overview
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[1180px] flex-1 items-center px-5 py-10 sm:px-8">
        <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="self-center">
            <Badge tone="accent">{demoLabels.demoAuth}</Badge>
            <h1 className="mt-5 max-w-[560px] font-display text-[44px] leading-[1.02] tracking-[-0.03em] text-ink sm:text-[54px]">
              A household, three offers, and one honest decision.
            </h1>
            <p className="mt-4 max-w-[54ch] text-[15px] leading-7 text-ink-muted">
              This workspace is seeded with the Morgan household: a month-to-month
              broadband plan, a mobile bundle with a $20 family discount, and a
              policy that refuses contracts longer than 12 months.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                ["Household", "The Morgan Household"],
                ["Member", "Alex Morgan · Owner"],
                ["Currency", "USD"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-line bg-surface px-4 py-3"
                >
                  <div className="text-[10px] text-ink-faint">{label}</div>
                  <div className="mt-1 text-[12px] font-medium leading-5 text-ink">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-raised px-4 py-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="text-[12px] leading-5 text-ink-muted">
                No password is collected. This is a demo session cookie scoped to
                the seeded household. Wallet approvals use the Passport passkey
                flow separately.
              </p>
            </div>
          </div>

          <Panel tone="raised" className="self-center overflow-hidden">
            <div className="border-b border-line px-6 py-5">
              <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                <KeyRound className="size-4 text-accent" />
                Demo sign-in
              </div>
              <h2 className="mt-2 font-display text-[26px] leading-tight text-ink">
                Enter the workspace
              </h2>
              <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">
                Signed in as Alex Morgan, owner of the Morgan household.
              </p>
            </div>

            <form action="/api/auth/login" method="post" className="px-6 py-5">
              <input type="hidden" name="householdId" value={DEMO_HOUSEHOLD_ID} />
              <input type="hidden" name="userId" value={DEMO_USER_ID} />

              {error ? (
                <div className="mb-4">
                  <InlineNotice tone="danger" title="Sign-in did not complete">
                    The demo household could not be opened. Try again.
                  </InlineNotice>
                </div>
              ) : null}

              <button type="submit" className={buttonClass("primary", "w-full")}>
                Continue as Alex Morgan
              </button>

              <p className="mt-4 text-[11px] leading-4 text-ink-faint">
                By continuing you enter a synthetic demo environment. Provider
                names and terms are illustrative. Payments are simulated unless a
                live Kite session is explicitly configured.
              </p>
            </form>

            <div className="border-t border-line bg-surface px-6 py-4">
              <div className="text-[10px] font-medium text-ink-faint">
                What you can do inside
              </div>
              <ul className="mt-2 grid gap-1.5 text-[11px] leading-5 text-ink-muted">
                <li>Run SERV constraint extraction on a plain-English request</li>
                <li>Compare three offers down to the 24-month total</li>
                <li>Approve exact consequences and request a capped Kite session</li>
                <li>Verify the decision receipt hash chain</li>
              </ul>
            </div>
          </Panel>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 py-5 text-[11px] text-ink-faint sm:px-8">
        <span>{brand.workingNameNote}</span>
        <span>{demoLabels.provider} · {demoLabels.illustrative}</span>
      </footer>
    </div>
  );
}
