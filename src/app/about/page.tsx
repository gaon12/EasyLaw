import Image from "next/image";
import Link from "next/link";
import {
  ChevronRightIcon,
  FileTextIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/components/icons";
import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

const spotlightItems = [
  {
    category: "Service",
    href: "/guide",
    title: "판결문을 결론과 이유부터 다시 읽습니다",
    description:
      "긴 문장을 그대로 던지지 않고, 판단 결과와 핵심 이유를 먼저 보여줍니다.",
  },
  {
    category: "AI Research",
    href: "/research",
    title: "생활 속 질문에서 확인할 근거를 찾습니다",
    description:
      "상황을 자연어로 쓰면 답변과 함께 살펴봐야 할 근거 후보를 정리합니다.",
  },
  {
    category: "Workspace",
    href: "/me",
    title: "내 문서와 팀 문서를 분리해 관리합니다",
    description:
      "개인 문서함과 조직 문서함을 나눠 민감한 자료의 접근 범위를 지킵니다.",
  },
] as const;

const summaryItems = [
  {
    href: "/catalog",
    icon: SearchIcon,
    label: "서비스",
    title: "검색에서 이해로",
    description:
      "사건번호, 법원명, 키워드로 판결문을 찾고 쉬운 설명 화면으로 이어갑니다.",
  },
  {
    href: "/research",
    icon: SparklesIcon,
    label: "기술",
    title: "질문에서 근거로",
    description:
      "AI 답변을 검토 출발점으로 두고, 확인해야 할 근거와 한계를 함께 보여줍니다.",
  },
  {
    href: "/security",
    icon: ShieldIcon,
    label: "신뢰",
    title: "문서 권한을 분리",
    description:
      "비공개 문서와 조직 공유 문서를 구분해 필요한 사람에게만 열리도록 설계합니다.",
  },
] as const;

const growthGroups = [
  {
    title: "사용자 지원",
    links: [
      { href: "/support", label: "고객센터" },
      { href: "/guide", label: "쉬운 판결문 예시" },
      { href: "/notice", label: "공지사항" },
    ],
  },
  {
    title: "이해 도구",
    links: [
      { href: "/catalog", label: "판결문 검색" },
      { href: "/research", label: "AI 법률 질문" },
      { href: "/security", label: "계정 보호 설정" },
    ],
  },
  {
    title: "협업 공간",
    links: [
      { href: "/me", label: "내 문서함" },
      { href: "/org", label: "조직 문서함" },
      { href: "/privacy", label: "개인정보처리방침" },
    ],
  },
] as const;

export const metadata = pageMetadata({
  title: "서비스 소개",
  description:
    "EasyLaw가 판결문 검색, 쉬운 설명, AI 법률 질문을 통해 법률 문서를 더 쉽게 이해하도록 돕는 방식을 소개합니다.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <AppShell>
      <main className={styles.referenceMain}>
        <section className={styles.aboutHero} aria-labelledby="about-title">
          <div className={styles.aboutHeroMark}>
            <Image
              alt=""
              aria-hidden="true"
              height={96}
              priority
              src="/brand-character.svg"
              width={92}
            />
          </div>
          <p>EasyLaw Service</p>
          <h1 id="about-title">판결문 이해의 시작을 더 쉽게 만드는 서비스</h1>
          <nav className={styles.aboutHeroLinks} aria-label="서비스 소개 섹션">
            <a href="#spotlight">소식</a>
            <a href="#summary">서비스와 기술</a>
            <a href="#growth">함께 성장</a>
          </nav>
        </section>

        <section
          className={styles.referenceSection}
          id="spotlight"
          aria-labelledby="spotlight-title"
        >
          <SectionHeading
            eyebrow="Now"
            title="요즘 EasyLaw가 집중하는 일"
            description="navercorp.com 루트처럼 첫 화면 다음에 핵심 콘텐츠를 카드로 묶어, 사용자가 바로 들어갈 수 있는 서비스 흐름을 보여줍니다."
          />
          <div className={styles.aboutSpotlightGrid}>
            {spotlightItems.map((item) => (
              <Link
                className={styles.aboutSpotlightItem}
                href={item.href}
                key={item.href}
              >
                <span>{item.category}</span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                <ChevronRightIcon size={18} />
              </Link>
            ))}
          </div>
        </section>

        <section
          className={styles.referenceSection}
          id="summary"
          aria-labelledby="summary-title"
        >
          <SectionHeading
            eyebrow="Summary"
            title="주요 서비스와 기술 요약"
            description="판결문을 찾는 일, 쉬운 말로 읽는 일, AI 답변의 근거를 확인하는 일을 하나의 흐름으로 연결합니다."
            actionHref="/guide"
            actionLabel="쉬운 판결문 예시 보기"
          />
          <div className={styles.aboutSummaryGrid}>
            {summaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  className={styles.aboutSummaryItem}
                  href={item.href}
                  key={item.href}
                >
                  <span className={styles.pathIcon}>
                    <Icon size={22} />
                  </span>
                  <small>{item.label}</small>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <ChevronRightIcon size={18} />
                </Link>
              );
            })}
          </div>
        </section>

        <section
          className={styles.referenceSection}
          id="growth"
          aria-labelledby="growth-title"
        >
          <SectionHeading
            eyebrow="Together"
            title="함께 성장하는 EasyLaw"
            description="사용자, 팀, 운영자가 같은 법률 문서를 더 안전하고 쉽게 검토할 수 있도록 필요한 진입점을 모았습니다."
          />
          <div className={styles.aboutGrowthGrid}>
            {growthGroups.map((group) => (
              <article className={styles.aboutGrowthColumn} key={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>
                        {link.label}
                        <ChevronRightIcon size={16} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section
          className={styles.securityStrip}
          aria-labelledby="about-principle-title"
        >
          <FileTextIcon size={26} />
          <div>
            <span>Principle</span>
            <h2 id="about-principle-title">
              EasyLaw는 법률 자문을 대체하지 않습니다.
            </h2>
            <p>
              판결문과 법률 정보를 이해하기 쉽게 정리하는 보조 서비스이며,
              중요한 판단은 변호사 등 전문가와 확인하도록 안내합니다.
            </p>
          </div>
          <Link className={styles.secondaryButton} href="/support">
            문의하기
          </Link>
        </section>
      </main>
    </AppShell>
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
          <span>{actionLabel}</span>
          <ChevronRightIcon size={18} />
        </Link>
      )}
    </div>
  );
}
