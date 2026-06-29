"use client";

import { useState } from "react";
import styles from "./page.module.css";

type Judgment = {
  id: string;
  title: string;
  caseNumber: string;
  courtName: string;
  decidedOn: string;
  caseType: string;
  status: "pending" | "ready" | "needs_review";
  latestJobStatus: string | null;
  notificationCount: number;
};

export function JudgmentExplorer({
  initialJudgments,
}: {
  initialJudgments: Judgment[];
}) {
  const [query, setQuery] = useState("2023구합54112");
  const [email, setEmail] = useState("");
  const [judgments, setJudgments] = useState(initialJudgments);
  const [message, setMessage] = useState(
    "외부 API로 확인된 공개 판결문만 항목으로 만듭니다.",
  );
  const [isLoading, setIsLoading] = useState(false);

  async function search() {
    setIsLoading(true);
    setMessage("외부 근거 조회 결과를 확인하고 있습니다.");
    const response = await fetch("/api/judgments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, email: email || undefined }),
    });
    const data = await response.json();
    setIsLoading(false);

    if (!response.ok) {
      setMessage("검색 요청을 처리하지 못했습니다. 입력값을 확인해 주세요.");
      return;
    }

    setJudgments(data.judgments);
    setMessage(
      data.count > 0
        ? `${data.count}개 판결문 항목을 외부 API 기준으로 확인했습니다.`
        : "외부 API에서 확인된 판결문이 없습니다.",
    );
  }

  async function subscribe(judgmentId: string) {
    if (!email) {
      setMessage("알림을 받을 이메일 주소를 먼저 입력해 주세요.");
      return;
    }

    const response = await fetch(`/api/judgments/${judgmentId}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage("알림 등록에 실패했습니다. 이메일 주소를 확인해 주세요.");
      return;
    }

    setMessage(`생성 작업에 연결했습니다. 작업 ID: ${data.jobId}`);
  }

  return (
    <>
      <div className={styles.workspace}>
        <div className={styles.panelHeader}>
          <h2>판결문 이해 작업대</h2>
          <span className={styles.badge}>외부 근거 우선</span>
        </div>
        <div className={styles.workspaceBody}>
          <label className={styles.label} htmlFor="judgment-query">
            사건번호, 법원명, 판결 제목
          </label>
          <input
            id="judgment-query"
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 2023구합54112"
          />
          <label className={styles.label} htmlFor="notify-email">
            생성 완료 알림 이메일
          </label>
          <input
            id="notify-email"
            className={styles.input}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
          />
          <textarea
            className={styles.textarea}
            value={
              "판결문 원문을 붙여넣거나 텍스트 PDF에서 추출한 내용을 넣는 영역입니다.\n\nOCR은 Beta 핵심에서 제외하고, 텍스트 PDF 추출과 외부 API 근거 확인을 먼저 안정화합니다."
            }
            readOnly
            aria-label="판결문 입력 예시"
          />
          <div className={styles.buttonRow}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={search}
              disabled={isLoading}
            >
              {isLoading ? "조회 중" : "외부 API로 판결문 확인"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => {
                setQuery("학교폭력 처분 취소");
                setMessage("샘플 판결문 검색어를 입력했습니다.");
              }}
            >
              샘플 입력
            </button>
          </div>
          <p className={styles.notice}>{message}</p>
        </div>
      </div>

      <section className={styles.section} aria-labelledby="catalog-title">
        <div className={styles.sectionTitle}>
          <div>
            <h2 id="catalog-title">공개 판결문 카탈로그</h2>
            <p>
              생성 전 항목도 보이지만, 공개 출처가 확인된 판결문만 공개합니다.
            </p>
          </div>
        </div>
        <div className={styles.catalog}>
          {judgments.map((judgment) => (
            <article className={styles.judgmentCard} key={judgment.id}>
              <div>
                <span
                  className={
                    judgment.status === "ready"
                      ? styles.statusReady
                      : judgment.status === "needs_review"
                        ? styles.statusReview
                        : styles.statusPending
                  }
                >
                  {judgment.status === "ready"
                    ? "생성 완료"
                    : judgment.status === "needs_review"
                      ? "검토 필요"
                      : "생성 대기"}
                </span>
                <h3>{judgment.title}</h3>
                <div className={styles.meta}>
                  <span>{judgment.caseNumber}</span>
                  <span>{judgment.courtName}</span>
                  <span>{judgment.decidedOn}</span>
                </div>
              </div>
              <div>
                <p className={styles.meta}>
                  작업 상태: {judgment.latestJobStatus ?? "아직 없음"} / 알림{" "}
                  {judgment.notificationCount}건
                </p>
                <div className={styles.buttonRow}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => subscribe(judgment.id)}
                  >
                    완료 알림 받기
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
