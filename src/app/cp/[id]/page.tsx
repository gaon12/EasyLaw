import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { JudgmentDetailView } from "@/components/judgment-detail";
import { OrgShareControl } from "@/components/org-share-control";
import { AppShell } from "@/components/site-chrome";
import { isJudgmentBookmarked } from "@/lib/bookmarks";
import { getDatabase } from "@/lib/db";
import { buildDocumentReferenceLinks } from "@/lib/document-reference-links";
import { extractDocumentReferenceCandidates } from "@/lib/document-references";
import { extractRelatedCaseReferences } from "@/lib/judgment-relations";
import { pageMetadata } from "@/lib/metadata";
import { getUserOrganizations } from "@/lib/organizations";
import {
  getAccessibleUserJudgmentById,
  getLatestAnalysis,
  getPublicJudgmentsByCaseNumbers,
} from "@/lib/queries";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import styles from "../../page.module.css";

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
  const judgment = getAccessibleUserJudgmentById(db, id, user.id);
  if (!judgment) {
    notFound();
  }
  const isOwner = judgment.createdByUserId === user.id;
  const organizations = isOwner ? getUserOrganizations(db, user.id) : [];
  const relatedReferences = extractRelatedCaseReferences(
    judgment.originalText,
    judgment.caseNumber,
  );
  const documentReferences = buildDocumentReferenceLinks(
    db,
    extractDocumentReferenceCandidates(
      judgment.originalText,
      judgment.caseNumber,
    ),
  );
  const linkedJudgments = new Map(
    getPublicJudgmentsByCaseNumbers(
      db,
      relatedReferences.map((reference) => reference.caseNumber),
    ).map((relatedJudgment) => [relatedJudgment.caseNumber, relatedJudgment]),
  );

  return (
    <AppShell>
      {isOwner && organizations.length > 0 && (
        <div className={styles.orgShareWrap}>
          <OrgShareControl
            judgmentId={judgment.id}
            organizations={organizations.map((organization) => ({
              id: organization.id,
              name: organization.name,
            }))}
            sharedOrganizationId={judgment.organizationId}
          />
        </div>
      )}
      <JudgmentDetailView
        analysis={getLatestAnalysis(db, judgment.id)}
        bookmarkInitialActive={isJudgmentBookmarked(db, {
          judgmentId: judgment.id,
          userId: user.id,
        })}
        documentReferences={documentReferences}
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
