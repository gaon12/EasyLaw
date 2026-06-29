import { ChevronRightIcon, FileTextIcon, SearchIcon } from "@/components/icons";
import { AppShell, serviceShortcuts } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { sampleAnalysis } from "@/lib/easyread";
import { syncSampleExternalCatalog } from "@/lib/external-law";
import { getPublicJudgments } from "@/lib/queries";
import { JudgmentExplorer } from "./easylaw-client";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDatabase();
  await syncSampleExternalCatalog(db);
  const judgments = getPublicJudgments(db);

  return (
    <AppShell>
      <main className={styles.main}>
        <section className={styles.portalGrid} aria-labelledby="home-title">
          <div className={styles.searchHero}>
            <div className={styles.searchBlock}>
              <h1 className={styles.searchTitle} id="home-title">
                안녕하세요. 어떤 판결문을 쉽게 읽고 싶으세요?
              </h1>
              <form className={styles.searchForm} action="/catalog">
                <input
                  aria-label="통합검색"
                  name="q"
                  placeholder="사건번호, 법원명, 판결문 제목을 검색해요"
                />
                <button className={styles.searchButton} type="submit">
                  <SearchIcon size={26} />
                </button>
              </form>
            </div>

            <section
              className={styles.servicePanel}
              aria-labelledby="quick-title"
            >
              <h2 className={styles.panelTitle} id="quick-title">
                자주 찾는 서비스
              </h2>
              <div className={styles.shortcutGrid}>
                {serviceShortcuts.slice(0, 6).map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      className={styles.shortcut}
                      href={item.href}
                      key={item.href}
                    >
                      <span className={styles.shortcutIcon}>
                        <Icon size={20} />
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className={styles.sideGrid} aria-label="계정과 알림">
            <section className={styles.loginPanel}>
              <h2>로그인하고 판결문 알림과 저장 결과를 편하게 이용하세요.</h2>
              <div className={styles.loginServices}>
                <span>
                  <FileTextIcon size={18} />내 문서함
                </span>
                <span>
                  <FileTextIcon size={18} />
                  저장 결과
                </span>
                <span>
                  <FileTextIcon size={18} />
                  알림 신청
                </span>
                <span>
                  <FileTextIcon size={18} />
                  TOTP 보안
                </span>
              </div>
              <a
                className={`${styles.primaryButton} ${styles.fullButton}`}
                href="/login"
              >
                로그인하기
              </a>
            </section>

            <section className={styles.noticePanel}>
              <h2>공지사항</h2>
              <div className={styles.noticeList}>
                <a className={styles.noticeItem} href="/support">
                  공개 판결문 생성 알림 기능을 준비하고 있어요
                  <span>안내</span>
                </a>
                <a className={styles.noticeItem} href="/security">
                  조직 소유자와 운영 관리자는 TOTP가 필요해요
                  <span>보안</span>
                </a>
                <a className={styles.noticeItem} href="/guide">
                  어려운 법률 용어는 쉬운말로 나눠 설명해요
                  <span>가이드</span>
                </a>
              </div>
            </section>
          </aside>
        </section>

        <section className={styles.section} aria-labelledby="guide-title">
          <div className={styles.contentGrid}>
            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle} id="guide-title">
                상황별 도움
              </h2>
              <div className={styles.guideTabs}>
                <a
                  className={`${styles.guideTab} ${styles.guideTabActive}`}
                  href="/guide"
                >
                  판결문을 처음 볼 때
                </a>
                <a className={styles.guideTab} href="/catalog">
                  사건번호가 있을 때
                </a>
                <a className={styles.guideTab} href="/me">
                  결과를 저장할 때
                </a>
                <a className={styles.guideTab} href="/org">
                  팀과 함께 볼 때
                </a>
              </div>
              <div className={styles.listLinks}>
                <a className={styles.listLink} href="/catalog">
                  공개 판결문을 찾아 쉬운 설명 신청하기
                  <ChevronRightIcon size={18} />
                </a>
                <a className={styles.listLink} href="/guide">
                  쉬운 판결문이 어떤 구조인지 보기
                  <ChevronRightIcon size={18} />
                </a>
                <a className={styles.listLink} href="/security">
                  계정 보안을 먼저 확인하기
                  <ChevronRightIcon size={18} />
                </a>
              </div>
            </article>

            <article className={styles.contentCard}>
              <h2 className={styles.panelTitle}>원스톱 서비스</h2>
              <div className={styles.serviceTabs}>
                <span className={`${styles.chip} ${styles.chipActive}`}>
                  전체
                </span>
                <span className={styles.chip}>판결문</span>
                <span className={styles.chip}>알림</span>
                <span className={styles.chip}>조직</span>
              </div>
              <div className={styles.serviceCards}>
                <a className={styles.miniCard} href="/catalog">
                  <strong>판결문 검색</strong>
                  <span>공개 출처가 확인된 판결문부터 보여줘요</span>
                </a>
                <a className={styles.miniCard} href="/guide">
                  <strong>쉬운 설명 예시</strong>
                  <span>{sampleAnalysis.easyRead[0]}</span>
                </a>
                <a className={styles.miniCard} href="/me">
                  <strong>완료 알림</strong>
                  <span>아직 생성되지 않은 판결문도 이메일로 알려줘요</span>
                </a>
                <a className={styles.miniCard} href="/org">
                  <strong>조직 공유</strong>
                  <span>팀 문서함과 구성원 보안 상태를 확인해요</span>
                </a>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="catalog-title">
          <div className={styles.sectionTitle}>
            <div>
              <h2 id="catalog-title">공개 판결문</h2>
              <p>외부 API 출처가 확인된 판결문만 공개 목록으로 보여줘요.</p>
            </div>
            <a className={styles.secondaryButton} href="/catalog">
              더 보기
            </a>
          </div>
          <JudgmentExplorer initialJudgments={judgments} compact />
        </section>

        <section className={styles.section}>
          <article className={styles.banner}>
            <span className={styles.badge}>쉬운 판결문 Beta</span>
            <h2 className={styles.panelTitle}>
              어려운 표현은 나누고, 근거는 남겨요
            </h2>
            <p>
              판결의 결론, 이유, 법률 용어, 주의할 점을 분리해서 보여주고 외부
              API의 사건 정보가 LLM 결과보다 우선되도록 설계했어요.
            </p>
          </article>
        </section>
      </main>
    </AppShell>
  );
}
