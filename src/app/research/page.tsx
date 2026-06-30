import { LegalResearchPanel } from "@/components/legal-research-panel";
import { AppShell } from "@/components/site-chrome";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "AI 법률 질문",
  description:
    "자연어로 법률 상황을 입력하면 확인 범위, 근거 후보, 쉬운 답변 초안을 함께 보여줍니다.",
  path: "/research",
});

export default async function ResearchPage({
  searchParams,
}: PageProps<"/research">) {
  const { q } = await searchParams;
  const initialQuery =
    typeof q === "string" ? q.slice(0, LEGAL_RESEARCH_QUERY_MAX_LENGTH) : "";

  return (
    <AppShell>
      <main className={styles.main}>
        <LegalResearchPanel initialQuery={initialQuery} />
      </main>
    </AppShell>
  );
}
