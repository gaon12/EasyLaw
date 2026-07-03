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
import { type SupportedLocale, translate } from "@/lib/i18n";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import type { DashboardSnapshot, JudgmentListItem } from "@/lib/types";

const workflowSteps = [
  {
    number: "01",
    title: "판결문 찾기",
    description:
      "사건번호나 키워드로 공개 판결문을 찾고, 내 문서는 붙여넣거나 PDF로 올릴 수 있어요.",
  },
  {
    number: "02",
    title: "쉽게 읽기",
    description:
      "판단 결과, 이유, 법률 용어, 주의할 점을 쉬운 말로 차례로 확인해요.",
  },
  {
    number: "03",
    title: "궁금증 이어가기",
    description:
      "관련 판결문을 더 찾아보거나, 내 상황을 AI에게 이어서 질문할 수 있어요.",
  },
] as const;

const servicePaths = [
  {
    href: "/catalog",
    icon: SearchIcon,
    title: "판결문 검색",
    description: "사건번호나 법원명으로 공개 판결문을 찾아요.",
  },
  {
    href: "/guide",
    icon: FileTextIcon,
    title: "쉬운 판결문 예시",
    description: "쉬운 판결문이 어떤 모습인지 예시로 먼저 확인해요.",
  },
  {
    href: "/me",
    icon: BellIcon,
    title: "내 문서함",
    description: "내 문서와 처리 상태, 알림을 한곳에서 관리해요.",
  },
  {
    href: "/org",
    icon: BuildingIcon,
    title: "조직 문서함",
    description: "팀과 공유한 문서를 함께 볼 수 있어요.",
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
          <p className={styles.previewLabel}>오늘의 작업</p>
          <h1 id="dashboard-title">{displayName}님, 무엇을 이해해볼까요?</h1>
          <p>
            궁금한 상황을 AI에게 물어보거나, 판결문을 찾아보거나, 보관해 둔
            문서를 이어서 볼 수 있어요.
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
          <span className={styles.railLabel}>바로가기</span>
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
          eyebrow="자주 쓰는 기능"
          title="빠른 시작"
          description="자주 쓰는 기능을 한곳에 모았어요."
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
          eyebrow="판결문"
          title="최근 공개 판결문"
          description="최근 공개된 판결문이에요. 제목을 누르면 원문과 쉬운 설명을 볼 수 있어요."
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
          <span>보안</span>
          <h2 id="account-safety-title">
            내 문서는 나와 내가 초대한 사람만 볼 수 있어요.
          </h2>
          <p>
            비공개 문서는 본인만, 조직에 공유한 문서는 초대된 구성원만 열 수
            있어요.
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/security">
          보안 설정
        </Link>
      </section>
    </main>
  );
}

export function PublicHome({ locale = "ko" }: { locale?: SupportedLocale }) {
  const t = (key: string) => translate(locale, key);
  return (
    <main className={styles.referenceMain}>
      <section className={styles.referenceHero} aria-labelledby="home-title">
        <div className={styles.referenceCopy}>
          <div className={styles.referenceMeta}>
            <span data-i18n="home.meta.read">{t("home.meta.read")}</span>
            <span data-i18n="home.meta.ask">{t("home.meta.ask")}</span>
            <span data-i18n="home.meta.free">{t("home.meta.free")}</span>
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
          <p data-i18n="home.hero.lede">{t("home.hero.lede")}</p>
          <LandingSearch />
          <nav className={styles.sectionTabs} aria-label="서비스 섹션">
            <a data-i18n="home.tabs.preview" href="#preview">
              {t("home.tabs.preview")}
            </a>
            <a data-i18n="home.tabs.workflow" href="#workflow">
              {t("home.tabs.workflow")}
            </a>
            <a data-i18n="home.tabs.paths" href="#paths">
              {t("home.tabs.paths")}
            </a>
            <a data-i18n="home.tabs.privacy" href="#privacy">
              {t("home.tabs.privacy")}
            </a>
          </nav>
        </div>

        <aside className={styles.referenceRail} aria-label="주요 이동">
          <span className={styles.railLabel} data-i18n="home.rail.label">
            {t("home.rail.label")}
          </span>
          <Link className={styles.railPrimary} href="/research">
            <span data-i18n="home.rail.primary">{t("home.rail.primary")}</span>
            <ChevronRightIcon size={18} />
          </Link>
          <Link className={styles.railSecondary} href="/guide">
            <span data-i18n="home.rail.secondary">
              {t("home.rail.secondary")}
            </span>
            <ChevronRightIcon size={18} />
          </Link>
          <p data-i18n="home.rail.note">{t("home.rail.note")}</p>
        </aside>
      </section>

      <section
        className={styles.referenceSection}
        id="preview"
        aria-label="EasyLaw 결과 예시"
      >
        <SectionHeading
          eyebrow={t("home.eyebrow.preview")}
          eyebrowKey="home.eyebrow.preview"
          title={t("home.preview.title")}
          titleKey="home.preview.title"
          description={t("home.preview.description")}
          descriptionKey="home.preview.description"
          actionHref="/guide"
          actionLabel={t("home.preview.action")}
          actionKey="home.preview.action"
        />
        <div className={styles.splitPreview}>
          <article>
            <span
              className={styles.paneLabel}
              data-i18n="home.preview.original"
            >
              {t("home.preview.original")}
            </span>
            <p>
              피고는 원고에게 손해배상금과 이에 대하여 정해진 날부터 다 갚는
              날까지 계산한 지연손해금을 지급한다.
            </p>
            <p>소송비용 중 일부는 원고가, 나머지는 피고가 부담한다.</p>
          </article>
          <article>
            <span className={styles.paneLabel} data-i18n="home.preview.easy">
              {t("home.preview.easy")}
            </span>
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
          eyebrow={t("home.eyebrow.workflow")}
          eyebrowKey="home.eyebrow.workflow"
          title={t("home.workflow.title")}
          titleKey="home.workflow.title"
          description={t("home.workflow.description")}
          descriptionKey="home.workflow.description"
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
          eyebrow={t("home.eyebrow.paths")}
          eyebrowKey="home.eyebrow.paths"
          title={t("home.paths.title")}
          titleKey="home.paths.title"
          description={t("home.paths.description")}
          descriptionKey="home.paths.description"
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
          <span data-i18n="home.eyebrow.privacy">
            {t("home.eyebrow.privacy")}
          </span>
          <h2 data-i18n="home.privacy.title" id="privacy-title">
            {t("home.privacy.title")}
          </h2>
          <p data-i18n="home.privacy.description">
            {t("home.privacy.description")}
          </p>
        </div>
        <Link className={styles.secondaryButton} href="/privacy">
          <span data-i18n="home.privacy.action">
            {t("home.privacy.action")}
          </span>
        </Link>
      </section>
    </main>
  );
}

function SectionHeading({
  actionHref,
  actionKey,
  actionLabel,
  description,
  descriptionKey,
  eyebrow,
  eyebrowKey,
  title,
  titleKey,
}: {
  actionHref?: string;
  actionKey?: string;
  actionLabel?: string;
  description: string;
  descriptionKey?: string;
  eyebrow: string;
  eyebrowKey?: string;
  title: string;
  titleKey?: string;
}) {
  return (
    <div className={styles.referenceSectionHeader}>
      <div>
        <span data-i18n={eyebrowKey}>{eyebrow}</span>
        <h2 data-i18n={titleKey}>{title}</h2>
        <p data-i18n={descriptionKey}>{description}</p>
      </div>
      {actionHref && actionLabel && (
        <Link href={actionHref}>
          <span data-i18n={actionKey}>{actionLabel}</span>
          <ChevronRightIcon size={18} />
        </Link>
      )}
    </div>
  );
}
