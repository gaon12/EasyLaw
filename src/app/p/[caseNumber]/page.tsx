import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { JudgmentDetailView } from "@/components/judgment-detail";
import { AppShell } from "@/components/site-chrome";
import { isJudgmentBookmarked } from "@/lib/bookmarks";
import { getDatabase } from "@/lib/db";
import {
  ensurePublicJudgmentOriginalText,
  syncExternalCatalog,
} from "@/lib/external-law";
import { extractRelatedCaseReferences } from "@/lib/judgment-relations";
import { pageMetadata } from "@/lib/metadata";
import {
  getLatestAnalysis,
  getPublicJudgmentByIdentifier,
  getPublicJudgmentsByCaseNumbers,
} from "@/lib/queries";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

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
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  await syncExternalCatalog(db);
  let judgment = getPublicJudgmentByIdentifier(db, caseNumber);
  if (!judgment) {
    notFound();
  }
  await ensurePublicJudgmentOriginalText(db, judgment);
  judgment = getPublicJudgmentByIdentifier(db, caseNumber) ?? judgment;
  const relatedReferences = extractRelatedCaseReferences(
    judgment.originalText,
    judgment.caseNumber,
  );
  const linkedJudgments = new Map(
    getPublicJudgmentsByCaseNumbers(
      db,
      relatedReferences.map((reference) => reference.caseNumber),
    ).map((relatedJudgment) => [relatedJudgment.caseNumber, relatedJudgment]),
  );
  const bookmarkInitialActive = user
    ? isJudgmentBookmarked(db, {
        judgmentId: judgment.id,
        userId: user.id,
      })
    : false;

  return (
    <AppShell>
      <JudgmentDetailView
        analysis={getLatestAnalysis(db, judgment.id)}
        bookmarkInitialActive={bookmarkInitialActive}
        judgment={judgment}
        relatedJudgments={relatedReferences.map((reference) => {
          const linkedJudgment = linkedJudgments.get(reference.caseNumber);
          return {
            ...reference,
            href: linkedJudgment
              ? `/p/${encodeURIComponent(linkedJudgment.id)}`
              : `/catalog?q=${encodeURIComponent(reference.caseNumber)}`,
            title: linkedJudgment?.title,
          };
        })}
      />
    </AppShell>
  );
}
