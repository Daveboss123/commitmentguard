import clsx from "clsx";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "quiet";

export function buttonClass(
  variant: ButtonVariant = "primary",
  className?: string,
): string {
  return clsx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 text-[13px] font-medium leading-5 transition-colors disabled:cursor-not-allowed disabled:opacity-55",
    variant === "primary" &&
      "border border-accent-strong bg-accent-strong text-raised hover:bg-accent",
    variant === "secondary" &&
      "border border-line-strong bg-raised text-ink hover:border-accent/45 hover:bg-surface",
    variant === "ghost" &&
      "border border-transparent text-ink-muted hover:border-line hover:bg-surface hover:text-ink",
    variant === "danger" &&
      "border border-danger/40 bg-danger-soft text-danger hover:border-danger",
    variant === "quiet" &&
      "border border-line bg-transparent text-ink-muted hover:bg-surface hover:text-ink",
    className,
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) {
  return <a {...props} className={buttonClass(variant, className)} />;
}
