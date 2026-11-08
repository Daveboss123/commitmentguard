"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  ReceiptText,
  ScrollText,
  Settings,
  X,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

const groups = [
  {
    label: "Overview",
    items: [{ href: "/app", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Household",
    items: [{ href: "/app/commitments", label: "Commitments", icon: ScrollText }],
  },
  {
    label: "Decisions",
    items: [
      { href: "/app/compare", label: "New comparison", icon: GitCompareArrows },
      { href: "/app/analyses", label: "Analyses", icon: BarChart3 },
      { href: "/app/receipts", label: "Receipts", icon: ReceiptText },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/app/integrations", label: "Integrations", icon: Plug },
      { href: "/app/benchmark", label: "Benchmark", icon: FlaskConical },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2.5 pb-1.5 text-[11px] font-medium text-ink-faint">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] leading-5 transition-colors",
                      active
                        ? "bg-accent-soft font-medium text-accent-strong"
                        : "text-ink-muted hover:bg-[#f0ece1] hover:text-ink",
                    )}
                  >
                    <Icon
                      className={clsx(
                        "size-4 shrink-0",
                        active ? "text-accent" : "text-ink-faint",
                      )}
                      strokeWidth={1.6}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function HouseholdCard({
  householdName,
  memberName,
  role,
}: {
  householdName: string;
  memberName: string;
  role: string;
}) {
  return (
    <div className="mx-3 rounded-xl border border-line bg-[#f0ece1] px-3 py-2.5">
      <p className="truncate text-[13px] font-medium text-ink">{householdName}</p>
      <p className="mt-0.5 truncate text-[11px] text-ink-muted">
        {memberName} · {role}
      </p>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
        <span className="size-1.5 rounded-full bg-accent" />
        Demo workspace
      </p>
    </div>
  );
}

export function AppNav({
  householdName,
  memberName,
  role,
}: {
  householdName: string;
  memberName: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pb-4 pt-5">
          <BrandMark href="/app" />
        </div>
        <HouseholdCard
          householdName={householdName}
          memberName={memberName}
          role={role}
        />
        <NavList />
        <div className="border-t border-line p-3">
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-[#f0ece1] hover:text-ink"
            >
              <LogOut className="size-4 text-ink-faint" strokeWidth={1.6} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <BrandMark href="/app" size="default" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex size-9 items-center justify-center rounded-lg border border-line text-ink-muted"
          aria-label="Open navigation"
        >
          <Menu className="size-4" />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/30"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[300px] flex-col border-r border-line bg-surface shadow-panel">
            <div className="flex items-center justify-between px-5 py-4">
              <BrandMark href="/app" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-lg border border-line text-ink-muted"
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </button>
            </div>
            <HouseholdCard
              householdName={householdName}
              memberName={memberName}
              role={role}
            />
            <NavList onNavigate={() => setOpen(false)} />
            <div className="border-t border-line p-3">
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink-muted"
                >
                  <LogOut className="size-4 text-ink-faint" strokeWidth={1.6} />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
