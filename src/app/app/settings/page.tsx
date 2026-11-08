import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  History,
  LockKeyhole,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Badge,
  InlineNotice,
  KeyValue,
  PageHeader,
  Panel,
  PanelHeader,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { PolicyEditor } from "@/components/policy-editor";
import { DemoResetButton } from "@/components/demo-reset-button";
import { getPageContext } from "@/lib/page/context";
import { getHouseholdData } from "@/lib/page/data";
import { serverConfig } from "@/lib/app/config";
import { formatDate, formatDateTime, humanize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const { household, member } = await getPageContext();
  const data = await getHouseholdData(household.id);
  const canEdit = member?.role === "owner" || member?.role === "approver";

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Household rules, data portability and the demo environment. The policy is a hard-constraint source: changing it does not rewrite a past decision."
        actions={
          <Badge tone="accent">
            <Users className="size-3" />
            {humanize(member?.role ?? "viewer")}
          </Badge>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Household policy"
              description={
                data.policy
                  ? `Active version ${data.policy.version}. Every new analysis checks these rules before consent.`
                  : "No active policy is stored."
              }
              action={<Settings2 className="size-4 text-ink-faint" />}
            />
            {data.policy ? (
              <PolicyEditor
                householdId={household.id}
                canEdit={canEdit}
                policy={{
                  version: data.policy.version,
                  currency: data.policy.currency,
                  minimumMonthlySavingMinor:
                    data.policy.minimumMonthlySavingMinor,
                  maxContractMonths: data.policy.maxContractMonths,
                  mustKeepBenefits: data.policy.mustKeepBenefits,
                  mustHave: data.policy.mustHave,
                  mustNotHave: data.policy.mustNotHave,
                  softPreferences: data.policy.softPreferences,
                  unknownCriticalTermsPolicy:
                    data.policy.unknownCriticalTermsPolicy,
                  approvalRequiredFor: data.policy.approvalRequiredFor,
                }}
              />
            ) : (
              <div className="px-5 py-5">
                <InlineNotice tone="danger" title="No policy">
                  No analysis can run until a policy exists. Reset the demo to
                  restore the seeded policy.
                </InlineNotice>
              </div>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Audit log"
              description="Every mutation is written here. This is a demo ledger; it is not an external compliance archive."
              action={<History className="size-4 text-ink-faint" />}
            />
            {data.auditEvents.length === 0 ? (
              <p className="px-5 py-4 text-[12px] text-ink-muted">
                No audit event has been recorded.
              </p>
            ) : (
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full min-w-[680px] text-left text-[12px]">
                  <thead className="sticky top-0 border-b border-line bg-surface text-[11px] text-ink-faint">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Event</th>
                      <th className="px-5 py-2.5 font-medium">Entity</th>
                      <th className="px-5 py-2.5 font-medium">Actor</th>
                      <th className="px-5 py-2.5 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.auditEvents.slice(0, 60).map((event) => (
                      <tr key={event.id} className="align-top">
                        <td className="px-5 py-2.5">
                          <div className="font-mono-num text-[11px] text-ink">
                            {event.eventType}
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-[11px] text-ink-muted">
                          {humanize(event.entityType)}
                          <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                            {event.entityId.slice(0, 22)}
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-[11px]">
                          <Badge tone="neutral">{event.actorType}</Badge>
                          {event.actorId ? (
                            <div className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                              {event.actorId}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-5 py-2.5 text-[11px] text-ink-faint">
                          {formatDateTime(event.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel className="overflow-hidden">
            <PanelHeader
              title="Household"
              action={<ShieldCheck className="size-4 text-accent" />}
            />
            <div className="px-5 py-2">
              <dl>
                <KeyValue label="Name">{household.name}</KeyValue>
                <KeyValue label="Household id">
                  <span className="font-mono-num text-[10px]">
                    {household.id}
                  </span>
                </KeyValue>
                <KeyValue label="Default currency">
                  {household.defaultCurrency}
                </KeyValue>
                <KeyValue label="Locale">{household.locale}</KeyValue>
                <KeyValue label="Member">
                  {member?.displayName ?? "Unknown"} ·{" "}
                  {humanize(member?.role ?? "viewer")}
                </KeyValue>
                <KeyValue label="Created">
                  {formatDate(household.createdAt)}
                </KeyValue>
              </dl>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Data export"
              description="A complete JSON export: policy, commitments, offers, intents, analyses, approvals, executions, receipts and the audit log."
              action={<Download className="size-4 text-ink-faint" />}
            />
            <div className="px-5 py-4">
              <a
                href={`/api/households/${household.id}/export`}
                download="commitmentguard-export.json"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-raised px-4 py-2 text-[13px] font-medium text-ink hover:border-accent/45 hover:bg-surface"
              >
                <Download className="size-4" />
                Download household JSON
              </a>
              <p className="mt-2 text-[10px] leading-4 text-ink-faint">
                Session tokens and server secrets are never included. Receipt hashes
                travel with the export so they can be rechecked.
              </p>
            </div>
            <div className="border-t border-line px-5 py-3">
              <Link
                href="/app/receipts"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent-strong"
              >
                Verify a receipt first
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Environment limits"
              description="Read-only. Set server-side; not editable from the browser."
              action={<LockKeyhole className="size-4 text-ink-faint" />}
            />
            <div className="px-5 py-2">
              <dl>
                <KeyValue label="Kite mode">
                  <span className="font-mono-num">{serverConfig.kite.mode}</span>
                </KeyValue>
                <KeyValue label="Execution">
                  {serverConfig.kite.executionMode === "live"
                    ? "Live x402"
                    : "Simulated"}
                </KeyValue>
                <KeyValue label="Session cap">
                  <span className="font-mono-num">
                    {serverConfig.kite.maxTotalUsdc} USDC
                  </span>
                </KeyValue>
                <KeyValue label="Per-transaction cap">
                  <span className="font-mono-num">
                    {serverConfig.kite.maxPerTxUsdc} USDC
                  </span>
                </KeyValue>
                <KeyValue label="SERV model">
                  <span className="font-mono-num">
                    {serverConfig.serv.model}
                  </span>
                </KeyValue>
                <KeyValue label="Demo reset">
                  {process.env.DEMO_RESET_ENABLED === "0"
                    ? "Disabled"
                    : "Enabled"}
                </KeyValue>
              </dl>
            </div>
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader
              title="Demo reset"
              description="Restore the seeded Morgan household for a clean run-through."
            />
            <div className="px-5 py-4">
              <DemoResetButton householdId={household.id} />
            </div>
            <div className="border-t border-line bg-surface px-5 py-3">
              <p className="text-[10px] leading-4 text-ink-faint">
                Demo data only. A hosted deployment with in-memory storage resets on
                redeploy or a cold start; a reset here is not a backup operation.
              </p>
            </div>
          </Panel>

          <ButtonLink href="/app/integrations" variant="secondary" className="w-full">
            <LockKeyhole className="size-4" />
            Integration health
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
