import {
  BellIcon,
  BuildingIcon,
  ChevronRightIcon,
  FileTextIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  UploadIcon,
} from "@/components/icons";
import { AppShell } from "@/components/site-chrome";
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

export default function Home() {
  return (
    <AppShell>
      <main>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroInner}>
            <span className={styles.heroEyebrow}>
              <SparklesIcon size={16} />
              판결문 이해 보조 서비스
            </span>
            <h1 id="home-title">EasyLaw</h1>
            <p className={styles.heroLead}>
              어려운 판결문을 결론부터 차근차근.
              <br />
              필요한 내용을 쉬운 말로 나눠 읽어보세요.
            </p>
            <form className={styles.heroSearch} action="/catalog">
              <SearchIcon size={22} />
              <input
                aria-label="판결문 검색"
                name="q"
                placeholder="사건번호, 법원명, 판결문 제목을 입력하세요"
              />
              <button type="submit">찾기</button>
            </form>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="/catalog">
                <SearchIcon size={18} />
                판결문 찾기
              </a>
              <a className={styles.secondaryButton} href="/catalog">
                <UploadIcon size={18} />내 문서로 시작하기
              </a>
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
              return (
                <a className={styles.pathItem} href={path.href} key={path.href}>
                  <span className={styles.pathIcon}>
                    <Icon size={22} />
                  </span>
                  <div>
                    <h3>{path.title}</h3>
                    <p>{path.description}</p>
                  </div>
                  <ChevronRightIcon size={19} />
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
            <span>계정 보안</span>
            <h2>중요한 문서일수록 한 단계 더 안전하게</h2>
            <p>
              이메일 로그인에 2차 인증을 더할 수 있어요. 조직 소유자와 운영
              관리자는 필수로 사용합니다.
            </p>
          </div>
          <a className={styles.secondaryButton} href="/security">
            보안 설정 보기
            <ChevronRightIcon size={18} />
          </a>
        </section>
      </main>
    </AppShell>
  );
}
