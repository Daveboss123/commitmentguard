import Link from "next/link";
import clsx from "clsx";
import { brand } from "@/lib/brand";

export function BrandMark({
  size = "default",
  href = "/",
  showWordmark = true,
  className,
}: {
  size?: "default" | "large";
  href?: string;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={clsx("inline-flex items-center gap-2.5 text-ink", className)}
      aria-label={`${brand.name} home`}
    >
      <span
        className={clsx(
          "relative flex items-center justify-center rounded-[10px] bg-accent text-raised",
          size === "default" ? "size-8" : "size-10",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={size === "default" ? "size-[18px]" : "size-[22px]"}
          focusable="false"
        >
          <path
            d="M12 3.25 19 6v5.2c0 4.3-2.8 7.9-7 9.55-4.2-1.65-7-5.25-7-9.55V6l7-2.75Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="m8.9 12.1 2.05 2.05 4.15-4.3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showWordmark ? (
        <span className="flex flex-col leading-none">
          <span
            className={clsx(
              "font-display tracking-[-0.02em]",
              size === "default" ? "text-[19px]" : "text-[23px]",
            )}
          >
            {brand.name}
          </span>
          {size === "large" ? (
            <span className="mt-1 text-[11px] text-ink-muted">{brand.tagline}</span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}
