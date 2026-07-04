import Link from "next/link";
import {
  ChevronRightIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/components/icons";
import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import styles from "../page.module.css";

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

export const metadata = pageMetadata({
  title: "서비스 소개",
  description:
    "EasyLaw가 판결문 검색, 쉬운 설명, AI 법률 질문을 통해 법률 문서를 더 쉽게 이해하도록 돕는 방식을 소개합니다.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <AppShell>
      <main className={styles.aboutMain}>
        <section className={styles.aboutHero} aria-labelledby="about-title">
          <div className={styles.aboutHeroCopy}>
            <p>사용자의 질문을 따라</p>
            <h1 id="about-title">판결문 이해를 더 쉽게</h1>
            <strong>EasyLaw Service</strong>
          </div>
          <a className={styles.aboutHeroArrow} href="#summary">
            <span className={styles.visuallyHidden}>다음 섹션으로 이동</span>
          </a>
        </section>

        <section
          className={styles.aboutSummarySection}
          id="summary"
          aria-labelledby="summary-title"
        >
          <h2 id="summary-title">주요 서비스와 기술 요약</h2>
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
      </main>
    </AppShell>
  );
}
