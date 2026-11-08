import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Cpu,
  ExternalLink,
  FlaskConical,
  LockKeyhole,
  Network,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Dot,
  InlineNotice,
  KeyValue,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { ServProbeButton } from "@/components/serv-probe-button";
import { getPageContext } from "@/lib/page/context";
import { getServStatus } from "@/lib/integrations/serv/service";
import { getKiteStatus } from "@/lib/services/execution.service";
import { serverConfig } from "@/lib/app/config";
import { formatDateTime, humanize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Integrations",
};

export default async function IntegrationsPage() {
  await getPageContext();
  const [servResult, kiteResult] = await Promise.allSettled([
    getServStatus(false),
    getKiteStatus(),
  ]);
  const serv = servResult.status === "fulfilled" ? servResult.value : null;
  const servError =
    servResult.status === "rejected" ? String(servResult.reason) : null;
  const kite = kiteResult.status === "fulfilled" ? kiteResult.value : null;
  const kiteError =
    kiteResult.status === "rejected" ? String(kiteResult.reason) : null;

  const kiteReady =
    kite?.state === "ready" || kite?.state === "mock_mode";

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Integrations"
        description="What is actually configured, what was measured, and what fails closed. No integration is shown as healthy merely because an environment variable exists."
        actions={
          <ButtonLink href="/app/benchmark" variant="secondary">
            <FlaskConical className="size-4" />
            Run the benchmark
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Panel className="overflow-hidden">
          <Stat
            label="SERV Reasoning"
            value={serv?.configured ? "Configured" : "Not configured"}
            detail={serv?.model ?? "No model"}
            tone={serv?.configured ? "accent" : "danger"}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Kite adapter"
            value={kite ? humanize(kite.state) : "Unavailable"}
            detail={kite ? `${kite.mode} · ${kite.executionMode}` : "No adapter"}
            tone={kiteReady ? "accent" : "caution"}
          />
        </Panel>
        <Panel className="overflow-hidden">
          <Stat
            label="Payment execution"
            value={
              serverConfig.kite.executionMode === "live"
                ? "Live x402"
                : "Simulated"
            }
            detail={`Cap ${serverConfig.kite.maxTotalUsdc} USDC · ${serverConfig.kite.sessionTtl}`}
          />
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel className="flex flex-col overflow-hidden">
          <PanelHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Network className="size-4 text-accent" />
                SERV Reasoning
              </span>
            }
            description="Intent and offer-term extraction, plus plain-language explanation. It never decides allow, review or block."
            action={
              <Badge tone={serv?.configured ? "ok" : "danger"}>
                <Dot tone={serv?.configured ? "ok" : "danger"} />
                {serv?.configured ? "Configured" : "Not configured"}
              </Badge>
            }
          />
          <div className="px-5 py-2">
            <dl>
              <KeyValue label="Base URL">
                <span className="break-all font-mono-num text-[10px]">
                  {serv?.baseUrl ?? "—"}
                </span>
              </KeyValue>
              <KeyValue label="Model">
                <span className="font-mono-num">{serv?.model ?? "—"}</span>
              </KeyValue>
              <KeyValue label="Enabled">
                {serv?.enabled ? "Yes" : "No"}
              </KeyValue>
              <KeyValue label="Last probe">
                {serv?.reachable === null || serv?.reachable === undefined ? (
                  <span className="text-ink-faint">Not probed</span>
                ) : serv.reachable ? (
                  <span className="text-ok">
                    Reachable · {serv.latencyMs ?? "—"} ms
                  </span>
                ) : (
                  <span className="text-danger">Unreachable</span>
                )}
              </KeyValue>
              <KeyValue label="Checked">
                {serv ? formatDateTime(serv.checkedAt) : "—"}
              </KeyValue>
            </dl>
          </div>
          <div className="border-t border-line px-5 py-4">
            <ServProbeButton />
          </div>
          <div className="border-t border-line bg-surface px-5 py-3">
            <p className="text-[11px] leading-5 text-ink-muted">
              If SERV is expected but unavailable, extraction fails closed. The app
              only uses the labelled demo parser when SERV is deliberately
              unconfigured, and every such result says so.
            </p>
          </div>
          {servError ? (
            <div className="border-t border-line px-5 py-4">
              <InlineNotice tone="danger" title="SERV status failed">
                {servError}
              </InlineNotice>
            </div>
          ) : null}
        </Panel>

        <Panel className="flex flex-col overflow-hidden">
          <PanelHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Wallet className="size-4 text-accent" />
                Kite
              </span>
            }
            description="Capped payment sessions via Passport. The payment layer never claims provider activation."
            action={
              <Badge tone={kiteReady ? "ok" : "caution"}>
                <Dot tone={kiteReady ? "ok" : "caution"} />
                {kite ? humanize(kite.state) : "Unavailable"}
              </Badge>
            }
          />
          <div className="px-5 py-2">
            <dl>
              <KeyValue label="Adapter mode">
                <span className="font-mono-num">{kite?.mode ?? "—"}</span>
              </KeyValue>
              <KeyValue label="Execution mode">
                {kite?.executionMode === "live"
                  ? "Live x402"
                  : "Simulated checkout"}
              </KeyValue>
              <KeyValue label="CLI installed">
                {kite?.cliInstalled === null || kite?.cliInstalled === undefined
                  ? "Not reported"
                  : kite.cliInstalled
                    ? `Yes${kite.cliVersion ? ` · ${kite.cliVersion}` : ""}`
                    : "No"}
              </KeyValue>
              <KeyValue label="Logged in">
                {kite?.loggedIn === null || kite?.loggedIn === undefined
                  ? "Not reported"
                  : kite.loggedIn
                    ? `Yes${kite.userEmail ? ` · ${kite.userEmail}` : ""}`
                    : "No"}
              </KeyValue>
              <KeyValue label="Agent registered">
                {kite?.agentRegistered === null ||
                kite?.agentRegistered === undefined
                  ? "Not reported"
                  : kite.agentRegistered
                    ? "Yes"
                    : "No"}
              </KeyValue>
              <KeyValue label="Session active">
                {kite?.sessionActive === null ||
                kite?.sessionActive === undefined
                  ? "Not reported"
                  : kite.sessionActive
                    ? "Yes"
                    : "No"}
              </KeyValue>
              <KeyValue label="Checked">
                {kite ? formatDateTime(kite.checkedAt) : "—"}
              </KeyValue>
            </dl>
          </div>
          {kite?.note ? (
            <div className="border-t border-line px-5 py-3">
              <p className="text-[11px] leading-5 text-ink-muted">{kite.note}</p>
            </div>
          ) : null}
          <div className="mt-auto border-t border-line bg-surface px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-muted">
                Caps are enforced in the service, not just the form.
              </span>
              <Link
                href="/app/approvals"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong"
              >
                Open approvals
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
          {kiteError ? (
            <div className="border-t border-line px-5 py-4">
              <InlineNotice tone="danger" title="Kite status failed">
                {kiteError}
              </InlineNotice>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Payment limits"
            description="Server-side limits that apply before any adapter call."
            action={<LockKeyhole className="size-4 text-ink-faint" />}
          />
          <div className="px-5 py-2">
            <dl>
              <KeyValue label="Maximum session total">
                <span className="font-mono-num">
                  {serverConfig.kite.maxTotalUsdc} USDC
                </span>
              </KeyValue>
              <KeyValue label="Maximum per transaction">
                <span className="font-mono-num">
                  {serverConfig.kite.maxPerTxUsdc} USDC
                </span>
              </KeyValue>
              <KeyValue label="Session lifetime">
                <span className="font-mono-num">
                  {serverConfig.kite.sessionTtl}
                </span>
              </KeyValue>
              <KeyValue label="Approval lifetime">
                24 hours
              </KeyValue>
              <KeyValue label="Checkout target">
                <span className="font-mono-num text-[10px]">
                  {serverConfig.kite.checkoutUrl || "demo placeholder"}
                </span>
              </KeyValue>
              <KeyValue label="Provider activation">
                <span className="text-ink-muted">not_integrated</span>
              </KeyValue>
            </dl>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Failure policy"
            description="The product prefers a refused action to a trusted guess."
            action={<ShieldCheck className="size-4 text-ink-faint" />}
          />
          <ul className="divide-y divide-line">
            {[
              {
                icon: CircleAlert,
                text: "SERV configured but failing: extraction returns an error; no silent fallback.",
              },
              {
                icon: CircleAlert,
                text: "Unknown material term: the total stays unknown and approval is refused.",
              },
              {
                icon: CircleAlert,
                text: "Changed offer or ledger: approvals are stale and execution is refused.",
              },
              {
                icon: CircleAlert,
                text: "Expired or over-cap Kite session: nothing is executed.",
              },
              {
                icon: Cpu,
                text: "Duplicate execution: refused by the service, even if the button is clicked twice.",
              },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-2.5 px-5 py-3 text-[11px] leading-5">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-caution" />
                <span className="text-ink-muted">{text}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6">
        <InlineNotice tone="neutral" title="Environment note">
          This build is running the{" "}
          <span className="font-mono-num">{serverConfig.kite.mode}</span> Kite
          adapter with{" "}
          <span className="font-mono-num">{serverConfig.kite.executionMode}</span>{" "}
          execution. Secrets are read server-side only. No page displays an API key,
          a raw session token or a payment credential.
        </InlineNotice>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ButtonLink href="/app/executions" variant="secondary">
          <Wallet className="size-4" />
          Payment sessions
        </ButtonLink>
        <ButtonLink href="/app/receipts" variant="secondary">
          <ShieldCheck className="size-4" />
          Verify a receipt
        </ButtonLink>
        <a
          href="https://docs.openserv.ai/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink"
        >
          SERV documentation
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
