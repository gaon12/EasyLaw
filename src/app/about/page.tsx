import Link from "next/link";
import {
  CheckIcon,
  ChevronRightIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  XIcon,
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

const promiseDo = [
  "원문과 쉬운 설명을 나란히 보여줘요. 언제든 원문으로 돌아가 확인할 수 있어요.",
  "AI 답변에는 확인해야 할 근거와 한계를 함께 표시해요.",
  "자신 없는 설명은 그대로 내보내지 않고 검토 대상으로 표시해요.",
] as const;

const promiseDont = [
  "법률 자문을 대신하지 않아요. 중요한 판단은 변호사 등 전문가와 확인해 주세요.",
  "비공개 문서를 본인과 초대된 구성원 외에는 보여주지 않아요.",
  "결과를 단정하지 않아요. 비슷해 보여도 판결은 사건마다 다를 수 있어요.",
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
            <p className={styles.aboutHeroQuote}>
              「피고는 원고에게 위 금원에 대하여 다 갚는 날까지 연 12%의 비율에
              의한 지연손해금을 지급하라」
            </p>
            <h1 id="about-title">
              이런 문장을 <em>누구나 읽을 수 있는 말</em>로 바꿉니다
            </h1>
            <p className={styles.aboutHeroLede}>
              EasyLaw는 판결문을 찾아 쉬운 설명으로 바꾸고, AI 답변에는 확인할
              근거를 함께 붙이는 서비스입니다.
            </p>
            <div className={styles.aboutHeroActions}>
              <Link className={styles.aboutHeroPrimary} href="/catalog">
                판결문 검색하기
                <ChevronRightIcon size={18} />
              </Link>
              <Link className={styles.aboutHeroGhost} href="/guide">
                쉬운 판결문 예시 보기
              </Link>
            </div>
          </div>
        </section>

        <section
          className={styles.aboutSection}
          id="summary"
          aria-labelledby="summary-title"
        >
          <div className={styles.referenceSectionHeader}>
            <div>
              <span>하는 방식</span>
              <h2 id="summary-title">세 갈래로 돕습니다</h2>
              <p>
                검색, AI 질문, 문서 보안까지 판결문을 이해하는 과정 전체를
                다룹니다.
              </p>
            </div>
          </div>
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
          className={styles.aboutSection}
          id="principles"
          aria-labelledby="principles-title"
        >
          <div className={styles.referenceSectionHeader}>
            <div>
              <span>신뢰 원칙</span>
              <h2 id="principles-title">
                하는 일과 하지 않는 일을 분명히 합니다
              </h2>
              <p>
                법률 문서를 다루는 서비스인 만큼, 할 수 있는 것의 경계를 먼저
                밝힙니다.
              </p>
            </div>
          </div>
          <div className={styles.aboutPrinciplesGrid}>
            <article className={styles.aboutPrinciplePanel}>
              <h3>EasyLaw가 하는 일</h3>
              <ul>
                {promiseDo.map((item) => (
                  <li key={item}>
                    <span className={styles.aboutMarkDo}>
                      <CheckIcon size={16} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
            <article className={styles.aboutPrinciplePanel}>
              <h3>하지 않는 일</h3>
              <ul>
                {promiseDont.map((item) => (
                  <li key={item}>
                    <span className={styles.aboutMarkDont}>
                      <XIcon size={16} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className={styles.aboutCta} aria-labelledby="about-cta-title">
          <h2 id="about-cta-title">궁금한 판결문부터 시작해 보세요</h2>
          <p>판결문을 검색하거나, 지금 겪는 상황을 AI에게 물어볼 수 있어요.</p>
          <div className={styles.aboutHeroActions}>
            <Link className={styles.primaryButton} href="/catalog">
              판결문 검색
            </Link>
            <Link className={styles.secondaryButton} href="/research">
              AI에게 질문하기
            </Link>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
