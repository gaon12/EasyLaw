import Image from "next/image";
import Link from "next/link";
import styles from "@/app/page.module.css";
import { AuthRequiredLink } from "@/components/auth-required-link";
import {
  BellIcon,
  BuildingIcon,
  ChevronRightIcon,
  FileTextIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/icons";
import { LandingSearch } from "@/components/landing-search";
import { LocalTime } from "@/components/local-time";
import { serviceShortcuts } from "@/components/site-chrome";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import type { DashboardSnapshot, JudgmentListItem } from "@/lib/types";

const workflowSteps = [
  {
    number: "01",
    title: "자료를 찾거나 올리기",
    description:
      "사건번호, 법원명, 문서 제목으로 시작하고 필요한 경우 비공개 문서를 별도로 보관합니다.",
  },
  {
    number: "02",
    title: "결론과 근거 나누기",
    description:
      "판단 결과, 이유, 법률 용어, 주의할 점을 서로 다른 문단으로 분리해 읽습니다.",
  },
  {
    number: "03",
    title: "다음 행동으로 이동",
    description:
      "검색, 예시, 내 문서함, 조직 문서함처럼 목적이 분명한 하위 화면으로 이어집니다.",
  },
] as const;

const servicePaths = [
  {
    href: "/catalog",
    icon: SearchIcon,
    title: "판결문 검색",
    description: "공개 판결문을 사건번호와 법원명 기준으로 찾습니다.",
  },
  {
    href: "/guide",
    icon: FileTextIcon,
    title: "쉬운 판결문 예시",
    description: "결과 화면이 어떻게 문단별로 정리되는지 먼저 확인합니다.",
  },
  {
    href: "/me",
    icon: BellIcon,
    title: "내 문서함",
    description: "로그인 후 개인 문서, 처리 상태, 알림을 관리합니다.",
  },
  {
    href: "/org",
    icon: BuildingIcon,
    title: "조직 문서함",
    description: "팀 단위로 공유되는 문서와 접근 권한을 분리합니다.",
  },
] as const;

const loginRequiredPaths = new Set(["/me", "/org"]);

export function SignedInHome({
  displayName,
  judgments,
  snapshot,
}: {
  displayName: string;
  judgments: JudgmentListItem[];
  snapshot: DashboardSnapshot;
}) {
  return (
    <main className={styles.referenceMain}>
      <section
        className={styles.referenceHero}
        aria-labelledby="dashboard-title"
      >
        <div className={styles.referenceCopy}>
          <div className={styles.referenceMeta}>
            <span>WORKSPACE</span>
            <span>EasyLaw</span>
            <span>실시간 작업대</span>
          </div>
          <p className={styles.previewLabel}>오늘의 작업대</p>
          <h1 id="dashboard-title">{displayName}님, 무엇을 이해해볼까요?</h1>
          <p>
            검색, 질문, 문서 보관을 한 화면에 몰아두지 않고 작업 단위별로
            나눴습니다. 필요한 섹션에서 시작한 뒤 전용 페이지로 이동할 수
            있습니다.
          </p>
          <form action="/research" className={styles.referenceSearch}>
            <input
              aria-label="법률 상황 질문"
              maxLength={LEGAL_RESEARCH_QUERY_MAX_LENGTH}
              name="q"
              placeholder="예: 중고거래 사기를 당했는데 돈을 돌려받을 수 있나요?"
            />
            <button type="submit" aria-label="AI 질문하기">
              <SearchIcon size={22} />
            </button>
          </form>
          <nav className={styles.sectionTabs} aria-label="홈 섹션">
            <a href="#quick-start">빠른 시작</a>
            <a href="#recent-judgments">최근 판결문</a>
            <a href="#account-safety">보안 상태</a>
          </nav>
        </div>

        <aside className={styles.referenceRail} aria-label="서비스 현황">
          <span className={styles.railLabel}>PRIMARY ACTION</span>
          <Link className={styles.railPrimary} href="/catalog">
            판결문 검색으로 이동
            <ChevronRightIcon size={18} />
          </Link>
          <dl className={styles.metricList}>
            <div>
              <dt>공개 판결문</dt>
              <dd>{snapshot.publicJudgmentCount}건</dd>
            </div>
            <div>
              <dt>생성 대기</dt>
              <dd>{snapshot.queuedJobCount}건</dd>
            </div>
            <div>
              <dt>알림 대기</dt>
              <dd>{snapshot.pendingNotificationCount}건</dd>
            </div>
            <div>
              <dt>조직</dt>
              <dd>{snapshot.organizationCount}개</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section
        className={styles.referenceSection}
        id="quick-start"
        aria-labelledby="quick-start-title"
      >
        <SectionHeading
          eyebrow="LIVE PREVIEW"
          title="빠른 시작"
          description="자주 쓰는 작업은 카드로 분리하고, 각 카드는 하위 페이지로 바로 이어집니다."
          actionHref="/guide"
          actionLabel="화면 예시 보기"
        />
        <div className={styles.actionGrid}>
          {serviceShortcuts.slice(0, 4).map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <Link
                className={styles.actionItem}
                href={shortcut.href}
                key={shortcut.href}
              >
                <span className={styles.pathIcon}>
                  <Icon size={22} />
                </span>
                <span>
                  <strong>{shortcut.label}</strong>
                  <small>{shortcut.description}</small>
                </span>
                <ChevronRightIcon size={18} />
              </Link>
            );
          })}
        </div>
      </section>

      <section
        className={styles.referenceSection}
        id="recent-judgments"
        aria-labelledby="recent-judgments-title"
      >
        <SectionHeading
          eyebrow="DOCUMENTS"
          title="최근 공개 판결문"
          description="목록과 상세 읽기를 분리해 판결문 본문은 전용 화면에서 집중해서 봅니다."
          actionHref="/catalog?view=recent"
          actionLabel="전체 보기"
        />
        <div className={styles.documentList}>
          {judgments.map((judgment) => (
            <article className={styles.documentRow} key={judgment.id}>
              <span className={styles.statusPending}>공개</span>
              <div>
                <h3>{judgment.title}</h3>
                <p>
                  {judgment.caseNumber} · {judgment.courtName} ·{" "}
                  <LocalTime dateOnly dateTime={judgment.decidedOn} />
                </p>
              </div>
              <Link
                className={styles.secondaryButton}
                href={`/p/${encodeURIComponent(judgment.id)}`}
              >
                보기
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.securityStrip}
        id="account-safety"
        aria-labelledby="account-safety-title"
      >
        <ShieldIcon size={26} />
        <div>
          <span>SECURITY</span>
          <h2 id="account-safety-title">
            개인 문서와 조직 문서는 접근 범위를 나눠 관리합니다.
          </h2>
          <p>
            민감한 자료는 로그인, 2차 인증, 조직 권한을 통과한 화면에서만
            이어집니다.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/security">
          보안 설정
        </Link>
      </section>
    </main>
  );
}

export function PublicHome() {
  return (
    <main className={styles.referenceMain}>
      <section className={styles.referenceHero} aria-labelledby="home-title">
        <div className={styles.referenceCopy}>
          <div className={styles.referenceMeta}>
            <span>CATALOG</span>
            <span>법률 이해</span>
            <span>EasyLaw</span>
          </div>
          <div className={styles.brandLockup}>
            <Image
              alt="EasyLaw 대표 캐릭터"
              height={132}
              priority
              src="/brand-character.svg"
              width={126}
            />
            <h1 id="home-title">EasyLaw</h1>
          </div>
          <p>
            어려운 판결문을 결론, 판단 이유, 법률 용어, 주의할 점으로 나눠
            읽습니다. 한 화면에 모든 설명을 쌓기보다 목적별 섹션과 하위 페이지로
            이어지도록 구성했습니다.
          </p>
          <LandingSearch />
          <nav className={styles.sectionTabs} aria-label="서비스 섹션">
            <a href="#preview">미리보기</a>
            <a href="#workflow">이용 흐름</a>
            <a href="#paths">시작 경로</a>
            <a href="#privacy">보안</a>
          </nav>
        </div>

        <aside className={styles.referenceRail} aria-label="주요 이동">
          <span className={styles.railLabel}>PRIMARY ACTION</span>
          <Link className={styles.railPrimary} href="/research">
            AI 질문 시작
            <ChevronRightIcon size={18} />
          </Link>
          <Link className={styles.railSecondary} href="/guide">
            쉬운 판결문 예시 열기
            <ChevronRightIcon size={18} />
          </Link>
          <p>
            로그인 전에는 공개 예시와 검색 흐름을 먼저 확인하고, 개인/조직
            문서는 인증 후 별도 화면에서 다룹니다.
          </p>
        </aside>
      </section>

      <section
        className={styles.referenceSection}
        id="preview"
        aria-label="EasyLaw 결과 예시"
      >
        <SectionHeading
          eyebrow="LIVE PREVIEW"
          title="핵심은 먼저, 근거는 바로 옆에"
          description="판결문 원문과 쉬운 설명을 같은 문서 안에서도 문단별로 분리해 보여줍니다."
          actionHref="/guide"
          actionLabel="전체 예시 보기"
        />
        <div className={styles.splitPreview}>
          <article>
            <span className={styles.paneLabel}>판결문 원문</span>
            <p>
              피고는 원고에게 손해배상금과 이에 대하여 정해진 날부터 다 갚는
              날까지 계산한 지연손해금을 지급한다.
            </p>
            <p>소송비용 중 일부는 원고가, 나머지는 피고가 부담한다.</p>
          </article>
          <article>
            <span className={styles.paneLabel}>쉬운 설명</span>
            <div className={styles.resultCallout}>
              <span>한눈에 보는 결론</span>
              <strong>피고가 원고에게 배상금을 지급해야 해요.</strong>
            </div>
            <ul>
              <li>늦게 지급하면 그 기간만큼 이자가 더해져요.</li>
              <li>재판에 든 비용은 양쪽이 나누어 부담해요.</li>
            </ul>
          </article>
        </div>
      </section>

      <section
        className={styles.referenceSection}
        id="workflow"
        aria-labelledby="workflow-title"
      >
        <SectionHeading
          eyebrow="PROCESS"
          title="판결문을 이해하는 세 단계"
          description="각 단계는 독립적인 문단과 화면으로 나뉘어 다음 작업을 선택하기 쉽습니다."
        />
        <div className={styles.stepGrid}>
          {workflowSteps.map((step) => (
            <article className={styles.stepItem} key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.referenceSection}
        id="paths"
        aria-labelledby="paths-title"
      >
        <SectionHeading
          eyebrow="ROUTES"
          title="지금 하려는 일로 이동하세요"
          description="검색, 예시, 내 문서, 조직 문서를 서로 다른 책임의 페이지로 분리했습니다."
        />
        <div className={styles.actionGrid}>
          {servicePaths.map((path) => {
            const Icon = path.icon;
            const content = (
              <>
                <span className={styles.pathIcon}>
                  <Icon size={22} />
                </span>
                <span>
                  <strong>{path.title}</strong>
                  <small>{path.description}</small>
                </span>
                <ChevronRightIcon size={18} />
              </>
            );
            return loginRequiredPaths.has(path.href) ? (
              <AuthRequiredLink
                className={styles.actionItem}
                key={path.href}
                nextPath={path.href}
              >
                {content}
              </AuthRequiredLink>
            ) : (
              <Link
                className={styles.actionItem}
                href={path.href}
                key={path.href}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </section>

      <section
        className={styles.securityStrip}
        id="privacy"
        aria-labelledby="privacy-title"
      >
        <ShieldIcon size={26} />
        <div>
          <span>PRIVACY</span>
          <h2 id="privacy-title">민감한 내용은 필요한 화면에서만 다룹니다.</h2>
          <p>
            공개 판결문은 출처를 남기고, 사용자가 붙여넣은 문서는 로그인한
            본인만 접근할 수 있는 비공개 주소로 관리합니다.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/privacy">
          개인정보처리방침
        </Link>
      </section>
    </main>
  );
}

function SectionHeading({
  actionHref,
  actionLabel,
  description,
  eyebrow,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className={styles.referenceSectionHeader}>
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionHref && actionLabel && (
        <Link href={actionHref}>
          {actionLabel}
          <ChevronRightIcon size={18} />
        </Link>
      )}
    </div>
  );
}
