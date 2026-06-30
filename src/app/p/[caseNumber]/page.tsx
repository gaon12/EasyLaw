import { notFound } from "next/navigation";
import { JudgmentDetailView } from "@/components/judgment-detail";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { syncSampleExternalCatalog } from "@/lib/external-law";
import {
  getLatestAnalysis,
  getPublicJudgmentByCaseNumber,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PublicJudgmentPage({
  params,
}: PageProps<"/p/[caseNumber]">) {
  const { caseNumber } = await params;
  const db = getDatabase();
  await syncSampleExternalCatalog(db);
  const judgment = getPublicJudgmentByCaseNumber(db, caseNumber);
  if (!judgment) {
    notFound();
  }

  return (
    <AppShell>
      <JudgmentDetailView
        analysis={getLatestAnalysis(db, judgment.id)}
        judgment={judgment}
      />
    </AppShell>
  );
}
