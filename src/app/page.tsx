import { cookies } from "next/headers";
import Image from "next/image";
import { AuthRequiredLink } from "@/components/auth-required-link";
import {
  BellIcon,
  BuildingIcon,
  ChevronRightIcon,
  FileTextIcon,
  SearchIcon,
  ShieldIcon,
  UploadIcon,
} from "@/components/icons";
import { LandingSearch } from "@/components/landing-search";
import { AppShell, serviceShortcuts } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { syncSampleExternalCatalog } from "@/lib/external-law";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import { pageMetadata } from "@/lib/metadata";
import { getDashboardSnapshot, getPublicJudgments } from "@/lib/queries";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import styles from "./page.module.css";

const steps = [
  {
    number: "01",
    title: "판결문을 찾거나 올려요",
    description: "사건번호로 찾거나 텍스트와 PDF 문서를 직접 올릴 수 있어요.",
  },
  {
    number: "02",
    title: "중요한 내용을 나눠요",
    description: "결론, 판단 이유, 법률 용어, 주의할 점을 구분해서 정리해요.",
  },
  {
    number: "03",
    title: "쉬운 설명으로 읽어요",
    description: "긴 문장과 어려운 표현을 풀어 쓰고 원문 근거도 함께 보여줘요.",
  },
];

const paths = [
  {
    href: "/catalog",
    icon: SearchIcon,
    title: "사건번호로 찾기",
    description: "알고 있는 사건번호나 법원명으로 시작해요.",
  },
  {
    href: "/guide",
    icon: FileTextIcon,
    title: "쉬운 판결문 예시",
    description: "결과가 어떤 순서와 표현으로 제공되는지 살펴봐요.",
  },
  {
    href: "/me",
    icon: BellIcon,
    title: "내 문서와 알림",
    description: "저장한 결과와 처리 중인 문서의 알림을 관리해요.",
  },
  {
    href: "/org",
    icon: BuildingIcon,
    title: "조직에서 함께 보기",
    description: "구성원과 문서를 공유하고 보안 상태를 확인해요.",
  },
];

const loginRequiredPaths = new Set(["/me", "/org"]);

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "판결문을 이해하기 쉽게",
  description:
    "공개 판결문 검색, 비공개 문서 저장, AI 법률 질문을 한곳에서 시작하세요.",
  path: "/",
});

export default async function Home() {
  const db = getDatabase();
  const sessionUser = getSessionUser(
    db,
    (await cookies()).get(SESSION_COOKIE)?.value,
  );

  if (sessionUser) {
    await syncSampleExternalCatalog(db);
    const snapshot = getDashboardSnapshot(db);
    const judgments = getPublicJudgments(db).slice(0, 3);

    return (
      <AppShell>
        <main className={styles.main}>
          <section
            className={styles.portalGrid}
            aria-labelledby="dashboard-title"
          >
            <div className={styles.searchHero}>
              <div className={styles.searchBlock}>
                <p className={styles.previewLabel}>오늘의 작업대</p>
                <h1 className={styles.searchTitle} id="dashboard-title">
                  {sessionUser.displayName}님, 무엇을 이해해볼까요?
                </h1>
                <form action="/research" className={styles.searchForm}>
                  <input
                    aria-label="법률 상황 질문"
                    maxLength={LEGAL_RESEARCH_QUERY_MAX_LENGTH}
                    name="q"
                    placeholder="예: 중고거래 사기를 당했는데 돈을 돌려받을 수 있나요?"
                  />
                  <button className={styles.searchButton} type="submit">
                    <SearchIcon size={22} />
                  </button>
                </form>
              </div>

              <section className={styles.servicePanel} aria-label="빠른 시작">
                <h2 className={styles.panelTitle}>빠른 시작</h2>
                <div className={styles.shortcutGrid}>
                  {serviceShortcuts.slice(0, 4).map((shortcut) => {
                    const Icon = shortcut.icon;
                    return (
                      <a
                        className={styles.shortcut}
                        href={shortcut.href}
                        key={shortcut.href}
                      >
                        <span className={styles.shortcutIcon}>
                          <Icon size={20} />
                        </span>
                        <span className={styles.shortcutText}>
                          <strong>{shortcut.label}</strong>
                          <span>{shortcut.description}</span>
                        </span>
                      </a>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className={styles.loginPanel} aria-label="서비스 현황">
              <h2>내가 바로 확인할 수 있는 정보</h2>
              <div className={styles.loginServices}>
                <span>공개 판결문 {snapshot.publicJudgmentCount}건</span>
                <span>생성 대기 {snapshot.queuedJobCount}건</span>
                <span>알림 대기 {snapshot.pendingNotificationCount}건</span>
                <span>조직 {snapshot.organizationCount}개</span>
              </div>
              <a className={styles.primaryButton} href="/catalog">
                판결문 검색으로 이동
              </a>
            </aside>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <div>
                <h2>최근 공개 판결문</h2>
                <p>사건번호나 법원명으로 바로 열람할 수 있는 판결문이에요.</p>
              </div>
              <a className={styles.secondaryButton} href="/catalog">
                전체 보기
              </a>
            </div>
            <div className={styles.catalog}>
              {judgments.map((judgment) => (
                <article className={styles.judgmentCard} key={judgment.id}>
                  <div>
                    <span className={styles.statusPending}>공개</span>
                    <h3>{judgment.title}</h3>
                    <div className={styles.meta}>
                      <span>{judgment.caseNumber}</span>
                      <span>{judgment.courtName}</span>
                      <span>{judgment.decidedOn}</span>
                    </div>
                  </div>
                  <a
                    className={styles.primaryButton}
                    href={`/p/${encodeURIComponent(judgment.caseNumber)}`}
                  >
                    판결문 보기
                  </a>
                </article>
              ))}
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroInner}>
            <Image
              alt="EasyLaw 대표 캐릭터"
              className={styles.heroCharacter}
              height={177}
              priority
              src="/brand-character.svg"
              width={170}
            />
            <h1 id="home-title">EasyLaw</h1>
            <p className={styles.heroLead}>
              어려운 판결문을 결론부터 차근차근.
              <br />
              필요한 내용을 쉬운 말로 나눠 읽어보세요.
            </p>
            <LandingSearch />
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="/catalog">
                <SearchIcon size={18} />
                판결문 찾기
              </a>
              <AuthRequiredLink
                className={styles.secondaryButton}
                nextPath="/catalog#custom-judgment"
              >
                <UploadIcon size={18} />내 문서로 시작하기
              </AuthRequiredLink>
            </div>
          </div>
        </section>

        <section
          className={styles.previewSection}
          aria-label="EasyLaw 결과 예시"
        >
          <div className={styles.previewHeader}>
            <div>
              <span className={styles.previewLabel}>쉬운 판결문 미리보기</span>
              <h2>핵심은 먼저, 근거는 바로 옆에</h2>
            </div>
            <a href="/guide">
              전체 예시 보기
              <ChevronRightIcon size={18} />
            </a>
          </div>
          <div className={styles.documentPreview}>
            <div className={styles.documentNav}>
              <span className={styles.documentTitle}>
                <FileTextIcon size={18} />
                손해배상 사건
              </span>
              <span className={styles.documentMeta}>
                서울중앙지방법원 · 판결
              </span>
            </div>
            <div className={styles.documentBody}>
              <div className={styles.originalPane}>
                <span className={styles.paneLabel}>판결문 원문</span>
                <p>
                  피고는 원고에게 손해배상금과 이에 대하여 정해진 날부터 다 갚는
                  날까지 계산한 지연손해금을 지급한다.
                </p>
                <p>소송비용 중 일부는 원고가, 나머지는 피고가 부담한다.</p>
              </div>
              <div className={styles.easyPane}>
                <span className={styles.paneLabel}>쉬운 설명</span>
                <div className={styles.resultCallout}>
                  <span>한눈에 보는 결론</span>
                  <strong>피고가 원고에게 배상금을 지급해야 해요.</strong>
                </div>
                <ul>
                  <li>늦게 지급하면 그 기간만큼 이자가 더해져요.</li>
                  <li>재판에 든 비용은 양쪽이 나누어 부담해요.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section
          className={styles.processSection}
          aria-labelledby="process-title"
        >
          <div className={styles.sectionIntro}>
            <span>이용 방법</span>
            <h2 id="process-title">판결문을 이해하는 세 단계</h2>
            <p>읽는 순서를 고민하지 않아도 중요한 내용부터 정리해 드려요.</p>
          </div>
          <div className={styles.stepGrid}>
            {steps.map((step) => (
              <article className={styles.stepItem} key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.pathSection} aria-labelledby="path-title">
          <div className={styles.sectionIntro}>
            <span>필요한 곳부터</span>
            <h2 id="path-title">지금 하려는 일로 시작하세요</h2>
          </div>
          <div className={styles.pathGrid}>
            {paths.map((path) => {
              const Icon = path.icon;
              const content = (
                <>
                  <span className={styles.pathIcon}>
                    <Icon size={22} />
                  </span>
                  <div>
                    <h3>{path.title}</h3>
                    <p>{path.description}</p>
                  </div>
                  <ChevronRightIcon size={19} />
                </>
              );

              return loginRequiredPaths.has(path.href) ? (
                <AuthRequiredLink
                  className={styles.pathItem}
                  key={path.href}
                  nextPath={path.href}
                >
                  {content}
                </AuthRequiredLink>
              ) : (
                <a className={styles.pathItem} href={path.href} key={path.href}>
                  {content}
                </a>
              );
            })}
          </div>
        </section>

        <section className={styles.securityBand}>
          <div className={styles.securityIcon}>
            <ShieldIcon size={26} />
          </div>
          <div>
            <span>개인정보 보호</span>
            <h2>민감한 내용은 필요한 만큼만 다뤄요</h2>
            <p>
              공개 판결문은 출처를 남기고, 사용자가 붙여넣은 문서는 로그인한
              본인만 볼 수 있는 비공개 주소로 관리합니다.
            </p>
          </div>
          <a className={styles.secondaryButton} href="/privacy">
            개인정보처리방침 보기
            <ChevronRightIcon size={18} />
          </a>
        </section>
      </main>
    </AppShell>
  );
}
