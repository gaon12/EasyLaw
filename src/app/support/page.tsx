import { AppShell } from "@/components/site-chrome";
import { translate } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { getRequestLocale } from "@/lib/server-locale";
import styles from "../page.module.css";

export const metadata = pageMetadata({
  title: "고객센터",
  description:
    "판결문 검색, AI 질문, 생성 알림, 조직 문서함 이용 안내를 확인하세요.",
  path: "/support",
});

export default async function SupportPage() {
  const locale = await getRequestLocale();
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1 data-i18n="support.title">
                {translate(locale, "support.title")}
              </h1>
              <p data-i18n="support.description">
                {translate(locale, "support.description")}
              </p>
            </div>
          </div>
          <div className={styles.contentGrid}>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>자주 묻는 질문</h2>
              <div className={styles.listLinks}>
                <a className={styles.listLink} href="/catalog">
                  생성되지 않은 판결문도 알림을 받을 수 있나요?
                </a>
                <a className={styles.listLink} href="/security">
                  계정 보호 설정은 어디서 바꾸나요?
                </a>
                <a className={styles.listLink} href="/org">
                  조직에서 결과를 공유할 수 있나요?
                </a>
              </div>
            </article>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>문의</h2>
              <p>
                Beta 기간에는 오류 신고와 문서 삭제 요청을 먼저 받을 예정이에요.
                민감한 개인정보가 들어간 문서는 공개 목록과 분리해 다뤄요.
              </p>
            </article>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
