import { describe, expect, it } from "vitest";
import { runBenchmark } from "../runner";

describe("CommitmentGuard benchmark", () => {
  const report = runBenchmark();

  it("evaluates all 30 hand-authored cases against their labels", () => {
    const failures = report.cases
      .filter((item) => !item.passed)
      .map((item) => ({
        id: item.id,
        title: item.title,
        expectedDecision: item.expectedDecision,
        actualDecision: item.actualDecision,
        missingReasons: item.missingReasons,
        actualReasons: item.actualReasons,
        totalsMatch: item.totalsMatch,
        expectedTotals: {
          current12: item.expected.current12Minor,
          proposed12: item.expected.proposed12Minor,
          current24: item.expected.current24Minor,
          proposed24: item.expected.proposed24Minor,
        },
        actualTotals: {
          current12: item.actual.current12Minor,
          proposed12: item.actual.proposed12Minor,
          current24: item.actual.current24Minor,
          proposed24: item.actual.proposed24Minor,
        },
        consequenceMisses: item.consequenceMisses,
        injectionDetected: item.injectionDetected,
        injectionExpected: item.expected.injectionDetected,
      }));

    expect({ failures, metrics: report.metrics }).toEqual({
      failures: [],
      metrics: expect.objectContaining({ totalCases: 30, passedCases: 30 }),
    });
  });
});
