import { describe, expect, it } from "vitest";
import { decimalToMinor, minorToDecimal } from "../money";

describe("exact decimal money input", () => {
  it("parses decimal amounts without floating-point rounding", () => {
    expect(decimalToMinor("1.15")).toBe(115);
    expect(decimalToMinor("10.10")).toBe(1010);
    expect(decimalToMinor(" 0.29 ")).toBe(29);
    expect(decimalToMinor("00012.3")).toBe(1230);
  });

  it("honours currency precision", () => {
    expect(decimalToMinor("12", "JPY")).toBe(12);
    expect(decimalToMinor("0.000001", "USDC")).toBe(1);
    expect(() => decimalToMinor("12.1", "JPY")).toThrow();
    expect(() => decimalToMinor("1.005", "USD")).toThrow();
  });

  it("rejects invalid values instead of silently removing a limit", () => {
    for (const value of ["", "-1", "NaN", "Infinity", "1e2", "1,000", "1.2.3"]) {
      expect(() => decimalToMinor(value)).toThrow();
    }
    expect(() => decimalToMinor("9007199254740992")).toThrow();
  });

  it("round-trips safe integer amounts exactly", () => {
    for (const value of [0, 1, 115, 1010, Number.MAX_SAFE_INTEGER]) {
      expect(decimalToMinor(minorToDecimal(value))).toBe(value);
    }
    expect(minorToDecimal(12, "JPY")).toBe("12");
    expect(minorToDecimal(1, "USDC")).toBe("0.000001");
  });
});
