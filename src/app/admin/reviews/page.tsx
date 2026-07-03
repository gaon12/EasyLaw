import { AdminSettingsForm } from "@/components/admin-settings-form";
import { LocalTime } from "@/components/local-time";
import { PromptVersionManager } from "@/components/prompt-version-manager";
import { ReviewActions } from "@/components/review-actions";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { isReviewRequired } from "@/lib/easyread-generation";
import { pageMetadata } from "@/lib/metadata";
import type { EasyReadAnalysis } from "@/lib/types";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "결과 검토",
  description: "AI가 생성한 Easy-Read 설명을 공개 전에 검토하고 승인합니다.",
  robots: { index: false, follow: false },
});

type ReviewRow = {
  job_id: string;
  judgment_id: string;
  title: string;
  case_number: string;
  court_name: string;
  model_name: string | null;
  prompt_version: string;
  created_at: string;
  content_json: string;
};

type FailedRow = {
  job_id: string;
  title: string;
  case_number: string;
  failure_reason: string | null;
  updated_at: string;
};

export default function AdminReviewsPage() {
  const db = getDatabase();
  const reviews = db
    .prepare<[], ReviewRow>(
      `SELECT judgment_generation_jobs.id AS job_id,
        judgments.id AS judgment_id,
        judgments.title,
        judgments.case_number,
        judgments.court_name,
        analysis_results.model_name,
        analysis_results.prompt_version,
        analysis_results.created_at,
        analysis_results.content_json
      FROM judgment_generation_jobs
      JOIN judgments ON judgments.id = judgment_generation_jobs.judgment_id
      JOIN analysis_results
        ON analysis_results.job_id = judgment_generation_jobs.id
      WHERE judgment_generation_jobs.status = 'needs_review'
      ORDER BY analysis_results.created_at ASC`,
    )
    .all();

  const failures = db
    .prepare<[], FailedRow>(
      `SELECT judgment_generation_jobs.id AS job_id,
        judgments.title,
        judgments.case_number,
        judgment_generation_jobs.failure_reason,
        judgment_generation_jobs.updated_at
      FROM judgment_generation_jobs
      JOIN judgments ON judgments.id = judgment_generation_jobs.judgment_id
      WHERE judgment_generation_jobs.status = 'failed'
      ORDER BY judgment_generation_jobs.updated_at DESC
      LIMIT 20`,
    )
    .all();

  const promptVersions = db
    .prepare<
      [],
      {
        version: string;
        description: string;
        is_active: number;
        created_at: string;
      }
    >(
      `SELECT version, description, is_active, created_at
        FROM prompt_versions
        ORDER BY created_at DESC`,
    )
    .all();

  return (
    <AppShell variant="admin">
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>결과 검토</h1>
              <p>
                AI가 생성한 Easy-Read 설명을 공개 전에 확인해요. 검토 필수를
                켜면 승인 전까지 사용자에게 노출되지 않고 알림도 보내지
                않습니다.
              </p>
            </div>
            <span className={styles.badge}>검토 대기 {reviews.length}건</span>
          </div>
          <div className={styles.contentCard}>
            <AdminSettingsForm
              description={
                isReviewRequired(db)
                  ? "검토 필수가 켜져 있어요. 새 생성 결과는 승인해야 공개됩니다."
                  : "검토 필수가 꺼져 있어요. 생성 결과가 자동으로 공개됩니다."
              }
              fields={[
                {
                  key: "easyread_review_required",
                  label: "생성 결과 검토 필수",
                  options: [
                    { label: "끄기 (자동 공개)", value: "0" },
                    { label: "켜기 (승인 후 공개)", value: "1" },
                  ],
                  placeholder: "",
                  type: "select",
                  value: isReviewRequired(db) ? "1" : "0",
                },
              ]}
              scope="easyread"
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>검토 대기</h2>
              <p>승인하면 문서가 공개되고 신청된 이메일 알림이 발송돼요.</p>
            </div>
          </div>
          {reviews.length === 0 ? (
            <p className={styles.notice}>검토를 기다리는 결과가 없어요.</p>
          ) : (
            <div className={styles.reviewList}>
              {reviews.map((review) => {
                const analysis = parseAnalysis(review.content_json);
                return (
                  <article className={styles.reviewCard} key={review.job_id}>
                    <header>
                      <div>
                        <h3>{review.title}</h3>
                        <p className={styles.meta}>
                          {review.case_number} · {review.court_name} · 모델{" "}
                          {review.model_name ?? "알 수 없음"} ·{" "}
                          {review.prompt_version} ·{" "}
                          <LocalTime dateTime={review.created_at} />
                        </p>
                      </div>
                      <a
                        className={styles.ghostButton}
                        href={`/p/${encodeURIComponent(review.judgment_id)}`}
                      >
                        원문 보기
                      </a>
                    </header>
                    {analysis && (
                      <dl className={styles.reviewSummary}>
                        <div>
                          <dt>요약</dt>
                          <dd>{analysis.summary}</dd>
                        </div>
                        <div>
                          <dt>결론</dt>
                          <dd>{analysis.finalResult}</dd>
                        </div>
                        <div>
                          <dt>쉬운 설명</dt>
                          <dd>
                            <ul>
                              {analysis.easyRead.slice(0, 4).map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      </dl>
                    )}
                    <ReviewActions jobId={review.job_id} mode="review" />
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>실패·반려된 작업</h2>
              <p>원인을 확인한 뒤 다시 생성 대기열에 넣을 수 있어요.</p>
            </div>
          </div>
          {failures.length === 0 ? (
            <p className={styles.notice}>실패한 생성 작업이 없어요.</p>
          ) : (
            <div className={styles.reviewList}>
              {failures.map((failure) => (
                <article className={styles.reviewCard} key={failure.job_id}>
                  <header>
                    <div>
                      <h3>{failure.title}</h3>
                      <p className={styles.meta}>
                        {failure.case_number} ·{" "}
                        <LocalTime dateTime={failure.updated_at} />
                      </p>
                    </div>
                  </header>
                  <p className={styles.reviewFailureReason}>
                    {failure.failure_reason ?? "실패 사유가 기록되지 않았어요."}
                  </p>
                  <ReviewActions jobId={failure.job_id} mode="failed" />
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h2>Prompt version</h2>
              <p>
                생성 결과에 찍히는 프롬프트 버전을 관리해요. 활성 버전은 이후
                생성부터 적용됩니다.
              </p>
            </div>
          </div>
          <div className={styles.contentCard}>
            <PromptVersionManager
              versions={promptVersions.map((version) => ({
                createdAt: version.created_at,
                description: version.description,
                isActive: version.is_active === 1,
                version: version.version,
              }))}
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function parseAnalysis(contentJson: string): EasyReadAnalysis | null {
  try {
    return JSON.parse(contentJson) as EasyReadAnalysis;
  } catch {
    return null;
  }
}
