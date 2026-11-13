import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps analysis records readable without forcing a wide table on phones", () => {
  const source = readFileSync("src/components/analysis-history.tsx", "utf8");
  expect(source).toContain('@min-[42rem]:hidden');
  expect(source).toContain('@min-[42rem]:block');
  expect(source).toContain('<caption className="sr-only">');
  expect(source).toContain('Open analysis');
});

it("gives the evidence and arithmetic components mobile disclosure views", () => {
  const costs = readFileSync("src/components/cost-breakdown.tsx", "utf8");
  const evidence = readFileSync("src/components/evidence-explorer.tsx", "utf8");
  expect(costs).toContain('@min-[38rem]:hidden');
  expect(costs).toContain('Open source fact');
  expect(evidence).toContain('Source authenticity');
  expect(evidence).toContain('Recorded origin');
});
