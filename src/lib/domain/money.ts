/**
 * Money utilities.
 *
 * All stored money is an integer count of minor units. This module never uses
 * floating point arithmetic for money. Formatting is delegated to Intl, which
 * is display-only and never feeds back into a calculation.
 */

const MINOR_DIGITS: Record<string, number> = {
  USD: 2,
  GBP: 2,
  EUR: 2,
  AUD: 2,
  CAD: 2,
  NZD: 2,
  JPY: 0,
  USDC: 6,
};

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export function assertMinorUnits(value: number, label = "amount"): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer in minor units`);
  }
}

export function assertNonNegativeMinor(value: number, label = "amount"): void {
  assertMinorUnits(value, label);
  if (value < 0) {
    throw new Error(`${label} must not be negative`);
  }
}

export function addMinor(values: number[]): number {
  return values.reduce((total, value) => {
    assertMinorUnits(value);
    return total + value;
  }, 0);
}

/**
 * Returns null when any required component is unknown. Unknown must never be
 * coerced to zero.
 */
export function addKnownMinor(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return addMinor(values as number[]);
}

export function multiplyMinor(monthlyMinor: number, months: number): number {
  assertMinorUnits(monthlyMinor);
  if (!Number.isSafeInteger(months) || months < 0) {
    throw new Error("months must be a non-negative safe integer");
  }
  return monthlyMinor * months;
}

export function formatMoneyMinor(
  minor: number | null | undefined,
  currency = "USD",
  locale = "en-US",
  options?: { maximumFractionDigits?: number },
): string {
  if (minor === null || minor === undefined) return "Unknown";
  const digits = minorDigits(currency);
  const value = minor / 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: options?.maximumFractionDigits ?? digits,
    maximumFractionDigits: options?.maximumFractionDigits ?? digits,
  }).format(value);
}

export function formatMoneyDelta(
  minor: number | null | undefined,
  currency = "USD",
  locale = "en-US",
): string {
  if (minor === null || minor === undefined) return "Unknown";
  if (minor === 0) return formatMoneyMinor(0, currency, locale);
  const sign = minor > 0 ? "+" : "−";
  return `${sign}${formatMoneyMinor(Math.abs(minor), currency, locale)}`;
}

/** Formats a decimal USDC string without converting it through a float. */
export function formatUsdc(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "Unknown";
  const text = String(amount);
  if (!/^\d+(\.\d{1,6})?$/.test(text)) return `${text} USDC`;
  return `${text} USDC`;
}

export function usdToUsdc(amountMinor: number): string {
  assertNonNegativeMinor(amountMinor);
  const whole = Math.floor(amountMinor / 100);
  const cents = amountMinor % 100;
  return `${whole}.${String(cents).padStart(2, "0")}`;
}

export function usdcToMicro(amount: string): number {
  if (!/^\d+(\.\d{1,6})?$/.test(amount)) {
    throw new Error("Invalid USDC amount");
  }
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
}

/**
 * Compares two non-negative decimal strings at USDC precision without ever
 * converting them to floats. Returns -1, 0 or 1.
 */
export function compareUsdcAmounts(left: string, right: string): number {
  const leftMicro = BigInt(usdcToMicro(left));
  const rightMicro = BigInt(usdcToMicro(right));
  if (leftMicro < rightMicro) return -1;
  if (leftMicro > rightMicro) return 1;
  return 0;
}

export function minUsdcAmount(left: string, right: string): string {
  return compareUsdcAmounts(left, right) <= 0 ? left : right;
}
