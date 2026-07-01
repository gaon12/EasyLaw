import { notFound } from "next/navigation";
import { JudgmentDetailView } from "@/components/judgment-detail";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { syncExternalCatalog } from "@/lib/external-law";
import { pageMetadata } from "@/lib/metadata";
import {
  getLatestAnalysis,
  getPublicJudgmentByIdentifier,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/p/[caseNumber]">) {
  const { caseNumber } = await params;
  const db = getDatabase();
  await syncExternalCatalog(db);
  const judgment = getPublicJudgmentByIdentifier(db, caseNumber);

  if (!judgment) {
    return pageMetadata({
      title: "판결문을 찾을 수 없음",
      description: "요청한 공개 판결문을 찾을 수 없습니다.",
      path: `/p/${encodeURIComponent(caseNumber)}`,
      robots: { index: false, follow: false },
    });
  }

  return pageMetadata({
    title: `${judgment.caseNumber} ${judgment.title}`,
    description: `${judgment.courtName} ${judgment.decidedOn} 판결의 핵심 내용과 쉬운 설명을 확인하세요.`,
    path: `/p/${encodeURIComponent(judgment.id)}`,
  });
}

export default async function PublicJudgmentPage({
  params,
}: PageProps<"/p/[caseNumber]">) {
  const { caseNumber } = await params;
  const db = getDatabase();
  await syncExternalCatalog(db);
  const judgment = getPublicJudgmentByIdentifier(db, caseNumber);
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
