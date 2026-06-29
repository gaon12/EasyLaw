import { getDatabase } from "@/lib/db";
import { sampleAnalysis } from "@/lib/easyread";
import { syncSampleExternalCatalog } from "@/lib/external-law";
import { getDashboardSnapshot, getPublicJudgments } from "@/lib/queries";
import { JudgmentExplorer } from "./easylaw-client";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDatabase();
  await syncSampleExternalCatalog(db);
  const judgments = getPublicJudgments(db);
  const snapshot = getDashboardSnapshot(db);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <a className={styles.brand} href="/">
            <span className={styles.mark}>EL</span>
            <span>EasyLaw</span>
          </a>
          <nav className={styles.nav} aria-label="주요 페이지">
            <a href="/me">개인 페이지</a>
            <a href="/org">조직 페이지</a>
            <a href="/admin">운영 관리자</a>
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.headline}>
            <span className={styles.eyebrow}>판결문 이해 보조 Beta</span>
            <h1>판결문을 시민의 언어로 바꿉니다.</h1>
            <p>
              EasyLaw는 판례를 많이 보여주는 서비스가 아니라, 공개 판결문과
              사용자가 가진 법률문서를 실제로 이해할 수 있게 돕는 Easy-Read 변환
              서비스입니다.
            </p>
            <div className={styles.principles}>
              <div className={styles.principle}>
                <strong>외부 근거 우선</strong>
                <span>
                  법령·판례 메타데이터는 korean-law-mcp 같은 외부 API 값을
                  우선합니다.
                </span>
              </div>
              <div className={styles.principle}>
                <strong>문서 이해 보조</strong>
                <span>
                  승패 예측이나 소송 전략 대신 원문 의미와 판단 이유를
                  설명합니다.
                </span>
              </div>
              <div className={styles.principle}>
                <strong>TOTP 권장</strong>
                <span>
                  일반 사용자는 선택 권장, 관리자와 조직 소유자는 필수입니다.
                </span>
              </div>
            </div>
          </div>
          <JudgmentExplorer initialJudgments={judgments} />
        </section>

        <section className={styles.section} aria-labelledby="sample-title">
          <div className={styles.sectionTitle}>
            <div>
              <h2 id="sample-title">Easy-Read 결과 구조</h2>
              <p>실제 AI 연결 전, Beta 결과 화면과 검증 단위를 고정합니다.</p>
            </div>
          </div>
          <div className={styles.resultGrid}>
            <article className={styles.resultBlock}>
              <h3>핵심만 보면</h3>
              <p>{sampleAnalysis.summary}</p>
              <h3>쉽게 말하면</h3>
              <ul>
                {sampleAnalysis.easyRead.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className={styles.resultBlock}>
              <h3>원문 근거와 주의</h3>
              <ul>
                {sampleAnalysis.sourceGrounds.map((ground) => (
                  <li key={ground.label}>
                    <strong>{ground.label}</strong>: {ground.excerpt}
                  </li>
                ))}
              </ul>
              <div className={styles.termList}>
                {sampleAnalysis.terms.map((term) => (
                  <div className={styles.termItem} key={term.term}>
                    <strong>{term.term}</strong>
                    <p>{term.explanation}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="ops-title">
          <div className={styles.sectionTitle}>
            <div>
              <h2 id="ops-title">운영 현황</h2>
              <p>SQLite 기반 Beta 운영에 필요한 최소 지표입니다.</p>
            </div>
          </div>
          <div className={styles.adminGrid}>
            <div className={styles.metric}>
              <strong>{snapshot.publicJudgmentCount}</strong>
              <span>공개 판결문 항목</span>
            </div>
            <div className={styles.metric}>
              <strong>{snapshot.queuedJobCount}</strong>
              <span>대기 중 생성 작업</span>
            </div>
            <div className={styles.metric}>
              <strong>{snapshot.pendingNotificationCount}</strong>
              <span>대기 중 이메일 알림</span>
            </div>
            <div className={styles.metric}>
              <strong>{snapshot.organizationCount}</strong>
              <span>조직</span>
            </div>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          이 서비스는 법률자문이 아니라 문서 이해 보조 도구입니다. 중요한 법적
          판단은 변호사 등 전문가에게 확인해야 합니다.
        </div>
      </footer>
    </div>
  );
}
