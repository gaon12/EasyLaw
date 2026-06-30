import { LegalResearchPanel } from "@/components/legal-research-panel";
import { AppShell } from "@/components/site-chrome";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export default async function ResearchPage({
  searchParams,
}: PageProps<"/research">) {
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q : "";

  return (
    <AppShell>
      <main className={styles.main}>
        <LegalResearchPanel initialQuery={initialQuery} />
      </main>
    </AppShell>
  );
}
