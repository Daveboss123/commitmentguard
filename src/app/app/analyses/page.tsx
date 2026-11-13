import type { Metadata } from "next";
import { BarChart3, FileText } from "lucide-react";
import {
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
  StatsRow,
} from "@/components/ui";
import { ButtonLink } from "@/components/button";
import { AnalysisHistory } from "@/components/analysis-history";
import { getPageContext } from "@/lib/page/context";
import { getHouseholdData } from "@/lib/page/data";

export const metadata: Metadata = {
  title: "Analyses",
};

export default async function AnalysesPage() {
  const { household } = await getPageContext();
  const data = await getHouseholdData(household.id);

  const analyses = data.analyses;
  const blocked = analyses.filter((item) => item.decision === "block").length;
  const review = analyses.filter((item) => item.decision === "review").length;
  const allowed = analyses.filter((item) => item.decision === "allow").length;

  return (
    <div>
      <PageHeader
        eyebrow="Decisions"
        title="Analyses"
        description="Immutable decision records. Each one captures the intent version, offer version, ledger snapshot and evidence it was computed against."
        actions={
          <ButtonLink href="/app/compare">
            <BarChart3 className="size-4" />
            New comparison
          </ButtonLink>
        }
      />

      <StatsRow>
        <Stat label="All analyses" value={analyses.length} />
        <Stat label="Allowed" value={allowed} tone="accent" />
        <Stat label="Needs review" value={review} tone="caution" />
        <Stat label="Blocked" value={blocked} tone="danger" />
      </StatsRow>

      <div className="mt-6">
        <Panel>
          <PanelHeader
            title="Decision history"
            description="Newest first. A recalculated analysis is a new record; the old one stays readable."
          />
          {analyses.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-4" />}
              title="No analyses yet"
              description="Start with the Morgan household request. SERV will extract the constraints, you confirm them, and the deterministic engine will evaluate each offer."
              action={
                <ButtonLink href="/app/compare" variant="secondary">
                  Start a comparison
                </ButtonLink>
              }
            />
          ) : (
            <AnalysisHistory analyses={analyses} data={data} />
          )}
        </Panel>
      </div>
    </div>
  );
}
