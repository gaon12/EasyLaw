import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { JudgmentDetailView } from "@/components/judgment-detail";
import { AppShell } from "@/components/site-chrome";
import { isJudgmentBookmarked } from "@/lib/bookmarks";
import { getDatabase } from "@/lib/db";
import { extractRelatedCaseReferences } from "@/lib/judgment-relations";
import { pageMetadata } from "@/lib/metadata";
import {
  getCustomJudgmentById,
  getLatestAnalysis,
  getPublicJudgmentsByCaseNumbers,
} from "@/lib/queries";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "비공개 판결문",
  description: "로그인한 사용자만 볼 수 있는 비공개 판결문입니다.",
  robots: { index: false, follow: false },
});

export default async function CustomJudgmentPage({
  params,
}: PageProps<"/cp/[id]">) {
  const { id } = await params;
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    notFound();
  }
  const judgment = getCustomJudgmentById(db, id, user.id);
  if (!judgment) {
    notFound();
  }
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

  return (
    <AppShell>
      <JudgmentDetailView
        analysis={getLatestAnalysis(db, judgment.id)}
        bookmarkInitialActive={isJudgmentBookmarked(db, {
          judgmentId: judgment.id,
          userId: user.id,
        })}
        judgment={judgment}
        privateDocument
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
