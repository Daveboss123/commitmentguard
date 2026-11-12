import clsx from "clsx";
import type { ReactNode } from "react";
import type { Decision, Severity } from "@/lib/domain/types";
import { formatMoneyMinor } from "@/lib/domain/money";

type Tone = "neutral" | "accent" | "ok" | "caution" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "border-line bg-[#f1ede2] text-ink-muted",
  accent: "border-accent/25 bg-accent-soft text-accent-strong",
  ok: "border-ok/25 bg-ok-soft text-ok",
  caution: "border-caution/25 bg-caution-soft text-caution",
  danger: "border-danger/25 bg-danger-soft text-danger",
  info: "border-info/25 bg-info-soft text-info",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: "bg-ink-faint",
    accent: "bg-accent",
    ok: "bg-ok",
    caution: "bg-caution",
    danger: "bg-danger",
    info: "bg-info",
  };
  return <span className={clsx("size-1.5 rounded-full", colors[tone])} />;
}

export function DecisionBadge({
  decision,
  size = "default",
}: {
  decision: Decision;
  size?: "default" | "large";
}) {
  const tone: Tone =
    decision === "allow" ? "ok" : decision === "review" ? "caution" : "danger";
  const label =
    decision === "allow" ? "Allow" : decision === "review" ? "Review" : "Block";
  if (size === "large") {
    // The signature mark: a verdict rendered like an ink stamp on a document —
    // squared, double-ruled, a touch off axis. Semantics, not decoration.
    const stampTone: Record<Tone, string> = {
      neutral: "border-ink-muted text-ink-muted",
      accent: "border-accent text-accent-strong",
      ok: "border-ok text-ok",
      caution: "border-caution text-caution",
      danger: "border-danger text-danger",
      info: "border-info text-info",
    };
    return (
      <span
        className={clsx(
          "stamp relative inline-flex -rotate-[1.5deg] items-center rounded-[3px] px-3 py-1.5",
          "text-[13px] font-semibold uppercase leading-none tracking-[0.16em]",
          "border-[1.5px]",
          stampTone[tone],
        )}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium leading-5",
        toneClasses[tone],
      )}
    >
      <Dot tone={tone} />
      {label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const tone: Tone =
    severity === "low"
      ? "neutral"
      : severity === "medium"
        ? "info"
        : severity === "high"
          ? "caution"
          : "danger";
  return <Badge tone={tone}>{severity}</Badge>;
}

export function Panel({
  children,
  className,
  tone = "surface",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "surface" | "plain" | "raised";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={clsx(
        "rounded-panel border border-line",
        tone === "surface" && "bg-surface",
        tone === "plain" && "bg-transparent",
        tone === "raised" && "bg-raised shadow-panel",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-[62ch] text-[13px] leading-5 text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Money({
  minor,
  currency = "USD",
  className,
  unknownLabel = "Unknown",
}: {
  minor: number | null | undefined;
  currency?: string;
  className?: string;
  unknownLabel?: string;
}) {
  if (minor === null || minor === undefined) {
    return (
      <span className={clsx("font-mono-num text-ink-faint", className)}>
        {unknownLabel}
      </span>
    );
  }
  return (
    <span className={clsx("font-mono-num tabular", className)}>
      {formatMoneyMinor(minor, currency)}
    </span>
  );
}

export function MoneyDelta({
  minor,
  currency = "USD",
  className,
}: {
  minor: number | null | undefined;
  currency?: string;
  className?: string;
}) {
  if (minor === null || minor === undefined) {
    return (
      <span className={clsx("font-mono-num text-ink-faint", className)}>
        Unknown
      </span>
    );
  }
  const sign = minor > 0 ? "+" : minor < 0 ? "−" : "";
  const tone = minor > 0 ? "text-danger" : minor < 0 ? "text-ok" : "text-ink";
  return (
    <span className={clsx("font-mono-num tabular", tone, className)}>
      {sign}
      {formatMoneyMinor(Math.abs(minor), currency)}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-5 py-8">
      {icon ? (
        <span className="flex size-9 items-center justify-center rounded-full border border-line bg-paper text-ink-muted">
          {icon}
        </span>
      ) : null}
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 max-w-[58ch] text-[13px] leading-5 text-ink-muted">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-line pb-6">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-2 text-[12px] text-ink-muted">{eyebrow}</div>
        ) : null}
        <h1 className="font-display text-[34px] leading-[1.08] tracking-[-0.02em] text-ink sm:text-[40px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[70ch] text-[14px] leading-6 text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "accent" | "caution" | "danger";
}) {
  return (
    <div className="px-5 py-4">
      <div className="text-[12px] leading-4 text-ink-muted">{label}</div>
      <div
        className={clsx(
          "mt-2 font-mono-num tabular text-[24px] leading-none tracking-[-0.01em]",
          tone === "accent" && "text-accent-strong",
          tone === "caution" && "text-caution",
          tone === "danger" && "text-danger",
          (!tone || tone === "default") && "text-ink",
        )}
      >
        {value}
      </div>
      {detail ? (
        <div className="mt-2 text-[12px] leading-4 text-ink-faint">{detail}</div>
      ) : null}
    </div>
  );
}

export function KeyValue({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-4 py-2.5", className)}>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="text-right text-[13px] text-ink">{children}</dd>
    </div>
  );
}

export function InlineNotice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 text-[13px] leading-5",
        toneClasses[tone],
      )}
    >
      {title ? <div className="font-medium">{title}</div> : null}
      <div className={clsx(title && "mt-1")}>{children}</div>
    </div>
  );
}
