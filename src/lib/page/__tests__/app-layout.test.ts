import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import AppLayout from "@/app/app/layout";

vi.mock("@/lib/page/context", () => ({
  getPageContext: async () => ({
    household: { name: "Test household" },
    member: { displayName: "Test owner", role: "owner" },
  }),
}));

vi.mock("@/components/app-nav", () => ({ AppNav: () => null }));

it("stacks the app shell on mobile and reserves the horizontal layout for desktop", async () => {
  const layout = await AppLayout({ children: createElement("p", null, "Page content") });
  const html = renderToStaticMarkup(layout);
  const shellClasses = html.match(/^<div class="([^"]+)"/)?.[1].split(" ");

  expect(shellClasses).toContain("flex-col");
  expect(shellClasses).toContain("lg:flex-row");
  // Wide child content must not force the main flex item beyond the viewport.
  expect(html).toMatch(/<main class="[^"]*min-w-0/);
});
