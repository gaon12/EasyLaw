import { DictionaryUpdateButton } from "@/components/dictionary-update-button";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../../page.module.css";
import { DictionaryAdminPage } from "../_components";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "공개 사전 데이터 업데이트",
  description:
    "한국어기초사전, 표준국어대사전, 국가법령정보센터 법령용어 데이터를 관리합니다.",
  robots: { index: false, follow: false },
});

export default function AdminDictionaryUpdatePage() {
  return (
    <DictionaryAdminPage
      active="update"
      badge="사전 업데이트"
      description="한국어기초사전, 표준국어대사전, 국가법령정보센터 법령용어를 가져와 로컬 사전에 반영합니다."
      title="공개 사전 데이터 업데이트"
    >
      <section className={styles.section}>
        <div className={styles.contentCard}>
          <h2 className={styles.panelTitle}>업데이트 실행</h2>
          <p>
            업데이트가 끝나면 검색과 용어 설명에 바로 사용됩니다. 필요한 사전만
            골라 다시 가져올 수 있습니다.
          </p>
          <DictionaryUpdateButton />
        </div>
      </section>
    </DictionaryAdminPage>
  );
}
