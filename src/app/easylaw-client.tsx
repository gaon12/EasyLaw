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
  initialQuery = "",
  questionMode = false,
  showWorkspace = true,
}: {
  compact?: boolean;
  initialJudgments: Judgment[];
  initialQuery?: string;
  questionMode?: boolean;
  showWorkspace?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [email, setEmail] = useState("");
  const [judgments, setJudgments] = useState(initialJudgments);
  const [message, setMessage] = useState(
    questionMode
      ? "질문과 관련된 공개 판결문을 찾아볼 수 있어요."
      : "확인된 판결문 정보를 기준으로 검색해요.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customText, setCustomText] = useState("");

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

  async function createCustomJudgment() {
    setIsLoading(true);
    setMessage("비공개 판결문을 저장하고 있어요.");
    const response = await fetch("/api/custom-judgments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: customTitle, text: customText }),
    });
    const data = await response.json();
    setIsLoading(false);

    if (response.status === 401) {
      window.location.assign(
        `/login?next=${encodeURIComponent("/catalog#custom-judgment")}`,
      );
      return;
    }
    if (!response.ok) {
      setMessage("제목과 판결문 내용을 확인해 주세요.");
      return;
    }
    window.location.assign(data.href);
  }

  const visibleJudgments = compact ? judgments.slice(0, 3) : judgments;

  return (
    <>
      {!compact && showWorkspace && (
        <div className={styles.workspace}>
          <h2>판결문 이해 작업대</h2>
          <p>
            사건번호나 판결문 제목을 검색하고, 아직 생성되지 않은 결과는 이메일
            알림을 신청할 수 있어요.
          </p>
          <div className={styles.workspaceBody}>
            <label className={styles.label} htmlFor="judgment-query">
              {questionMode
                ? "궁금한 법률 상황"
                : "사건번호, 법원명, 판결문 제목"}
            </label>
            <input
              className={styles.input}
              id="judgment-query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                questionMode
                  ? "어떤 일이 있었고 무엇이 궁금한지 적어보세요"
                  : "예: 2023구합54112"
              }
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
            <div id="custom-judgment" className={styles.customDocumentHeading}>
              <strong>내 판결문으로 시작하기</strong>
              <span>로그인한 계정만 볼 수 있는 고유 주소로 저장됩니다.</span>
            </div>
            <input
              className={styles.input}
              onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="문서 제목"
              value={customTitle}
            />
            <textarea
              aria-label="커스텀 판결문 내용"
              className={styles.textarea}
              onChange={(event) => setCustomText(event.target.value)}
              placeholder="판결문 내용을 복사해 붙여넣으세요."
              value={customText}
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
                disabled={
                  isLoading ||
                  customTitle.trim().length < 2 ||
                  customText.trim().length < 20
                }
                onClick={createCustomJudgment}
                type="button"
              >
                비공개 판결문 저장
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
                <a
                  className={styles.primaryButton}
                  href={`/p/${encodeURIComponent(judgment.caseNumber)}`}
                >
                  판결문 보기
                </a>
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
      {visibleJudgments.length === 0 && (
        <p className={styles.notice}>검색 조건에 맞는 판결문이 아직 없어요.</p>
      )}
      {(compact || !showWorkspace) && (
        <p className={styles.notice}>{message}</p>
      )}
    </>
  );
}
