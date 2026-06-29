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
  compact = false,
  initialJudgments,
}: {
  compact?: boolean;
  initialJudgments: Judgment[];
}) {
  const [query, setQuery] = useState("2023구합54112");
  const [email, setEmail] = useState("");
  const [judgments, setJudgments] = useState(initialJudgments);
  const [message, setMessage] = useState(
    "확인된 판결문 정보를 기준으로 검색해요.",
  );
  const [isLoading, setIsLoading] = useState(false);

  async function search() {
    setIsLoading(true);
    setMessage("판결문 정보를 확인하고 있어요.");
    const response = await fetch("/api/judgments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, email: email || undefined }),
    });
    const data = await response.json();
    setIsLoading(false);

    if (!response.ok) {
      setMessage("검색 요청을 처리하지 못했어요. 입력값을 확인해 주세요.");
      return;
    }

    setJudgments(data.judgments);
    setMessage(
      data.count > 0
        ? `${data.count}개의 판결문을 찾았어요.`
        : "검색 조건에 맞는 판결문이 없어요.",
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
      setMessage("알림 등록에 실패했어요. 이메일 주소를 확인해 주세요.");
      return;
    }

    setMessage(`생성 작업에 연결했어요. 작업 ID: ${data.jobId}`);
  }

  const visibleJudgments = compact ? judgments.slice(0, 3) : judgments;

  return (
    <>
      {!compact && (
        <div className={styles.workspace}>
          <h2>판결문 이해 작업대</h2>
          <p>
            사건번호나 판결문 제목을 검색하고, 아직 생성되지 않은 결과는 이메일
            알림을 신청할 수 있어요.
          </p>
          <div className={styles.workspaceBody}>
            <label className={styles.label} htmlFor="judgment-query">
              사건번호, 법원명, 판결문 제목
            </label>
            <input
              className={styles.input}
              id="judgment-query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 2023구합54112"
              value={query}
            />
            <label className={styles.label} htmlFor="notify-email">
              완료 알림 이메일
            </label>
            <input
              className={styles.input}
              id="notify-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <textarea
              aria-label="판결문 입력 예시"
              className={styles.textarea}
              readOnly
              value={
                "판결문 원문을 붙여넣거나 텍스트 PDF에서 추출한 내용을 넣는 영역이에요.\n\n현재는 글자를 선택할 수 있는 PDF와 직접 붙여넣은 텍스트를 지원해요."
              }
            />
            <div className={styles.buttonRow}>
              <button
                className={styles.primaryButton}
                disabled={isLoading}
                onClick={search}
                type="button"
              >
                {isLoading ? "조회 중" : "판결문 확인하기"}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  setQuery("학교폭력 처분 취소");
                  setMessage("샘플 검색어를 입력했어요.");
                }}
                type="button"
              >
                샘플 입력하기
              </button>
            </div>
            <p className={styles.notice}>{message}</p>
          </div>
        </div>
      )}

      <div className={styles.catalog}>
        {visibleJudgments.map((judgment) => (
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
                  onClick={() => subscribe(judgment.id)}
                  type="button"
                >
                  완료 알림 받기
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {compact && <p className={styles.notice}>{message}</p>}
    </>
  );
}
