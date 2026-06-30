import { AppShell } from "@/components/site-chrome";
import { guideDocuments } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

export const metadata = pageMetadata({
  title: "쉬운 판결문 가이드",
  description:
    "판결문 읽는 순서, 쉬운말 작성 원칙, 비공개 문서 처리 기준을 확인하세요.",
  path: "/guide",
});

export default function GuidePage() {
  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.wikiHome}>
          <div className={styles.wikiHero}>
            <span className={styles.badge}>EasyLaw Wiki</span>
            <h1>쉬운 판결문 위키</h1>
            <p>
              판결문을 읽고, 설명하고, 안전하게 다루기 위한 기준을 문서처럼
              이어서 정리합니다. 게시판이 아니라 계속 고쳐 쓰는 지식 대문이에요.
            </p>
          </div>

          <div className={styles.wikiPortal}>
            <aside className={styles.wikiSidebar} aria-label="위키 분류">
              <strong>분류</strong>
              <a href="#reading">판결문 읽기</a>
              <a href="#writing">쉬운말 작성</a>
              <a href="#privacy">문서 보안</a>
            </aside>

            <section
              className={styles.wikiMainPanel}
              aria-labelledby="wiki-main"
            >
              <div className={styles.wikiWelcome}>
                <h2 id="wiki-main">대문</h2>
                <p>
                  처음이라면 “판결문 읽는 순서”부터 보고, 설명문을 작성할 때는
                  “쉬운말 작성 원칙”을 함께 열어두면 좋아요.
                </p>
              </div>

              <div className={styles.wikiCardGrid}>
                {guideDocuments.map((document) => (
                  <a
                    className={styles.wikiCard}
                    href={`/guide/${encodeURIComponent(document.slug)}`}
                    id={
                      document.slug.includes("읽는")
                        ? "reading"
                        : document.slug.includes("개인정보")
                          ? "privacy"
                          : "writing"
                    }
                    key={document.slug}
                  >
                    <span>문서</span>
                    <strong>{document.title}</strong>
                    <p>{document.summary}</p>
                    <time>최근 수정 {document.updatedOn}</time>
                  </a>
                ))}
              </div>
            </section>

            <aside className={styles.wikiSidebar} aria-label="최근 변경">
              <strong>최근 변경</strong>
              {guideDocuments.map((document) => (
                <a
                  href={`/guide/${encodeURIComponent(document.slug)}`}
                  key={document.slug}
                >
                  {document.updatedOn} · {document.title}
                </a>
              ))}
            </aside>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
