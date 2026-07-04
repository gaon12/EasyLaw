import { LegalTermManager } from "@/components/legal-term-manager";
import { getDatabase } from "@/lib/db";
import { listLegalDictionaryTerms } from "@/lib/dictionary";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../../page.module.css";
import { DictionaryAdminPage } from "../_components";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "자체 법률 용어 사전",
  description: "서비스가 먼저 보여줄 법률 용어 설명을 직접 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminDictionaryLegalTermsPage() {
  const db = getDatabase();
  const legalTerms = listLegalDictionaryTerms(db);

  return (
    <DictionaryAdminPage
      active="legal"
      badge="우선순위 사전"
      description="서비스가 반드시 먼저 보여줘야 하는 법률 용어 설명을 직접 등록하거나 법령용어 API에서 가져옵니다."
      title="자체 법률 용어 사전"
    >
      <section className={styles.section}>
        <div className={styles.contentCard}>
          <h2 className={styles.panelTitle}>용어 등록</h2>
          <p>
            같은 단어가 여러 사전에 있어도 이 설명이 1순위입니다. 상담 문맥에서
            반드시 쉬운 말로 풀어야 하는 표현을 등록해 주세요.
          </p>
          <LegalTermManager initialTerms={legalTerms} />
        </div>
      </section>
    </DictionaryAdminPage>
  );
}
