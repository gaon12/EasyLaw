"use client";

import { useRef, useState } from "react";
import { AltchaCaptcha } from "@/components/altcha-captcha";
import { LoginRequiredModal } from "@/components/auth-required-link";
import { LocalTime } from "@/components/local-time";
import { clientFingerprintHeaders } from "@/lib/client-fingerprint";
import {
  CUSTOM_JUDGMENT_TEXT_MAX_LENGTH,
  CUSTOM_JUDGMENT_TITLE_MAX_LENGTH,
  JUDGMENT_SEARCH_QUERY_MAX_LENGTH,
} from "@/lib/input-limits";
import { judgmentSearchTagExamples } from "@/lib/judgment-search";
import type { JudgmentListItem } from "@/lib/types";
import styles from "./page.module.css";

const JUDGMENT_LIST_PAGE_SIZE = 15;

type Judgment = Pick<
  JudgmentListItem,
  | "caseNumber"
  | "caseType"
  | "courtName"
  | "decidedOn"
  | "id"
  | "latestJobStatus"
  | "notificationCount"
  | "status"
  | "title"
>;

type JudgmentSearchResponse = {
  count: number;
  judgments: Judgment[];
};

type NotifyResponse = {
  jobId: string;
};

type CustomJudgmentResponse = {
  href: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string"
    ? value[key]
    : undefined;
}

function apiMessage(value: unknown, fallback: string) {
  return stringField(value, "message") ?? fallback;
}

function isJudgment(value: unknown): value is Judgment {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.caseNumber === "string" &&
    typeof value.courtName === "string" &&
    typeof value.decidedOn === "string" &&
    typeof value.caseType === "string" &&
    isJudgmentStatus(value.status) &&
    (typeof value.latestJobStatus === "string" ||
      value.latestJobStatus === null) &&
    typeof value.notificationCount === "number"
  );
}

function isJudgmentStatus(value: unknown): value is Judgment["status"] {
  return value === "pending" || value === "ready" || value === "needs_review";
}

function isJudgmentSearchResponse(
  value: unknown,
): value is JudgmentSearchResponse {
  return (
    isRecord(value) &&
    typeof value.count === "number" &&
    Array.isArray(value.judgments) &&
    value.judgments.every(isJudgment)
  );
}

function isNotifyResponse(value: unknown): value is NotifyResponse {
  return isRecord(value) && typeof value.jobId === "string";
}

function isCustomJudgmentResponse(
  value: unknown,
): value is CustomJudgmentResponse {
  return isRecord(value) && typeof value.href === "string";
}

function withSearchTag(query: string, tag: string) {
  const key = tag.slice(0, tag.indexOf(":"));
  const remainingTokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !token.startsWith(`${key}:`));
  return [...remainingTokens, tag].join(" ");
}

export function JudgmentExplorer({
  compact = false,
  initialJudgments,
  initialPage = 1,
  initialQuery = "",
  initialTotalCount = initialJudgments.length,
  initialView,
  questionMode = false,
  showWorkspace = true,
}: {
  compact?: boolean;
  initialJudgments: Judgment[];
  initialPage?: number;
  initialQuery?: string;
  initialTotalCount?: number;
  initialView?: "recent";
  questionMode?: boolean;
  showWorkspace?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [email, setEmail] = useState("");
  const [judgments, setJudgments] = useState(initialJudgments);
  const [page, setPage] = useState(initialPage);
  const [hasClientResults, setHasClientResults] = useState(false);
  const [message, setMessage] = useState(
    questionMode
      ? "질문과 관련된 공개 판결문을 찾아볼 수 있어요."
      : "확인된 판결문 정보를 기준으로 검색해요.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const authRedirectRef = useRef(false);
  const notificationRef = useRef<string | null>(null);
  const [pendingNotificationId, setPendingNotificationId] = useState<
    string | null
  >(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customText, setCustomText] = useState("");
  const [captchaPrompt, setCaptchaPrompt] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  async function withLoading(action: () => Promise<void>) {
    if (isLoadingRef.current || authRedirectRef.current) {
      return;
    }
    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      await action();
    } catch (_error) {
      setMessage("요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      isLoadingRef.current = false;
      if (!authRedirectRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function search(captchaPayload?: string) {
    if (!query.trim()) {
      setMessage("검색어를 입력해 주세요.");
      return;
    }

    await withLoading(async () => {
      setMessage("판결문 정보를 확인하고 있어요.");
      const response = await fetch("/api/judgments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...clientFingerprintHeaders(),
        },
        body: JSON.stringify({
          captchaPayload,
          email: email || undefined,
          query,
        }),
      });
      const data: unknown = await response.json();

      if (
        response.status === 403 &&
        stringField(data, "error") === "captcha_required"
      ) {
        setCaptchaPrompt(
          apiMessage(
            data,
            "보안 확인을 완료하면 판결문 검색을 계속할 수 있어요.",
          ),
        );
        setCaptchaResetKey((current) => current + 1);
        setMessage("보안 확인이 필요해요.");
        return;
      }
      if (response.status === 429 || response.status === 401) {
        setMessage(
          apiMessage(
            data,
            "비회원 이용 한도를 넘었어요. 잠시 후 다시 시도하거나 로그인해 주세요.",
          ),
        );
        return;
      }
      if (!response.ok) {
        setMessage("검색 요청을 처리하지 못했어요. 입력값을 확인해 주세요.");
        return;
      }
      if (!isJudgmentSearchResponse(data)) {
        setMessage("검색 응답 형식을 확인하지 못했어요. 다시 시도해 주세요.");
        return;
      }

      setCaptchaPrompt(null);
      setJudgments(data.judgments);
      setHasClientResults(true);
      setPage(1);
      setMessage(
        data.count > 0
          ? `${data.count}개의 판결문을 찾았어요.`
          : "검색 조건에 맞는 판결문이 없어요.",
      );
    });
  }

  async function subscribe(judgmentId: string) {
    if (notificationRef.current) {
      return;
    }
    if (!email) {
      setMessage("알림을 받을 이메일 주소를 먼저 입력해 주세요.");
      return;
    }

    notificationRef.current = judgmentId;
    setPendingNotificationId(judgmentId);
    try {
      const response = await fetch(`/api/judgments/${judgmentId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        setMessage("알림 등록에 실패했어요. 이메일 주소를 확인해 주세요.");
        return;
      }
      if (!isNotifyResponse(data)) {
        setMessage("알림 응답 형식을 확인하지 못했어요. 다시 시도해 주세요.");
        return;
      }

      setMessage(`생성 작업에 연결했어요. 작업 ID: ${data.jobId}`);
    } catch (_error) {
      setMessage("알림 등록 요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      notificationRef.current = null;
      setPendingNotificationId(null);
    }
  }

  async function createCustomJudgment() {
    await withLoading(async () => {
      setMessage("비공개 판결문을 저장하고 있어요.");
      const response = await fetch("/api/custom-judgments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: customTitle, text: customText }),
      });
      const data: unknown = await response.json();

      if (response.status === 401) {
        authRedirectRef.current = true;
        setLoginModalOpen(true);
        return;
      }
      if (!response.ok) {
        setMessage("제목과 판결문 내용을 확인해 주세요.");
        return;
      }
      if (!isCustomJudgmentResponse(data)) {
        setMessage("저장 응답 형식을 확인하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      window.location.assign(data.href);
    });
  }

  const visibleJudgments = compact ? judgments.slice(0, 3) : judgments;
  const usesServerPaging = !compact && !hasClientResults;
  const totalCount = usesServerPaging
    ? initialTotalCount
    : visibleJudgments.length;
  const pageCount = Math.max(
    1,
    Math.ceil(totalCount / JUDGMENT_LIST_PAGE_SIZE),
  );
  const pagedJudgments = compact
    ? visibleJudgments
    : usesServerPaging
      ? visibleJudgments
      : visibleJudgments.slice(
          (page - 1) * JUDGMENT_LIST_PAGE_SIZE,
          page * JUDGMENT_LIST_PAGE_SIZE,
        );

  function goToPage(nextPage: number) {
    const safePage = Math.min(pageCount, Math.max(1, nextPage));
    if (usesServerPaging) {
      window.location.assign(
        catalogPageHref({
          page: safePage,
          query: initialQuery,
          view: initialView,
        }),
      );
      return;
    }
    setPage(safePage);
  }

  return (
    <>
      <LoginRequiredModal
        nextPath="/catalog#custom-judgment"
        onClose={() => {
          authRedirectRef.current = false;
          setIsLoading(false);
          setLoginModalOpen(false);
        }}
        open={loginModalOpen}
      />
      {!compact && showWorkspace && (
        <div className={styles.workspace}>
          <h2>판결문 검색</h2>
          <p>
            사건번호나 판결문 제목을 검색하고, 아직 생성되지 않은 결과는 이메일
            알림을 신청할 수 있어요.
          </p>
          <div className={styles.workspaceBody}>
            <section className={styles.workspaceSection}>
              <div className={styles.workspaceSectionHeader}>
                <h3>공개 판결문 찾기</h3>
                <p>
                  사건번호, 법원명, 판결문 제목으로 공개된 판결문을 검색해요.
                  `연도:2024-2026`, `종류:민사`처럼 태그를 붙이면 조건을 좁힐 수
                  있어요. 알림 이메일은 생성 대기 문서가 준비됐을 때만
                  사용합니다.
                </p>
                <p className={styles.workspaceStatus}>{message}</p>
                {captchaPrompt && (
                  <div className={styles.workspaceNotice}>
                    <p>{captchaPrompt}</p>
                    <AltchaCaptcha
                      onVerified={(payload) => void search(payload)}
                      resetKey={captchaResetKey}
                    />
                  </div>
                )}
              </div>
              <label className={styles.label} htmlFor="judgment-query">
                {questionMode
                  ? "궁금한 법률 상황"
                  : "사건번호, 법원명, 판결문 제목"}
              </label>
              <input
                className={styles.input}
                id="judgment-query"
                maxLength={JUDGMENT_SEARCH_QUERY_MAX_LENGTH}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  questionMode
                    ? "어떤 일이 있었고 무엇이 궁금한지 적어보세요"
                    : "예: 손해배상 연도:2024-2026 종류:민사"
                }
                value={query}
              />
              <fieldset className={styles.searchTagRow}>
                <legend className={styles.visuallyHidden}>
                  검색 태그 예시
                </legend>
                {judgmentSearchTagExamples.map((tag) => (
                  <button
                    className={styles.searchTag}
                    key={tag}
                    onClick={() =>
                      setQuery((current) => withSearchTag(current, tag))
                    }
                    type="button"
                  >
                    {tag}
                  </button>
                ))}
              </fieldset>
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
              <div className={styles.buttonRow}>
                <button
                  className={styles.primaryButton}
                  disabled={isLoading}
                  onClick={() => void search()}
                  type="button"
                >
                  {isLoading ? "조회 중" : "판결문 확인하기"}
                </button>
              </div>
            </section>
            <section className={styles.workspaceSection} id="custom-judgment">
              <div className={styles.workspaceSectionHeader}>
                <h3>내 판결문으로 시작하기</h3>
                <p>
                  공개 목록에 없는 판결문은 직접 붙여넣어 비공개 문서로
                  저장해요. 저장한 문서는 로그인한 계정만 볼 수 있습니다.
                </p>
              </div>
              <label className={styles.label} htmlFor="custom-title">
                문서 제목
              </label>
              <input
                className={styles.input}
                id="custom-title"
                maxLength={CUSTOM_JUDGMENT_TITLE_MAX_LENGTH}
                onChange={(event) => setCustomTitle(event.target.value)}
                placeholder="예: 손해배상 판결문"
                value={customTitle}
              />
              <textarea
                aria-label="커스텀 판결문 내용"
                className={styles.textarea}
                maxLength={CUSTOM_JUDGMENT_TEXT_MAX_LENGTH}
                onChange={(event) => setCustomText(event.target.value)}
                placeholder="판결문 내용을 복사해 붙여넣으세요."
                value={customText}
              />
              <div className={styles.buttonRow}>
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
            </section>
          </div>
        </div>
      )}

      {!compact && visibleJudgments.length > 0 && (
        <div className={styles.judgmentListHeader}>
          <span>{totalCount.toLocaleString("ko-KR")}건</span>
          <div className={styles.listPager}>
            <button
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              type="button"
            >
              이전
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => goToPage(page + 1)}
              type="button"
            >
              다음
            </button>
          </div>
        </div>
      )}
      <div className={compact ? styles.catalog : styles.judgmentList}>
        {pagedJudgments.map((judgment) => (
          <article
            className={compact ? styles.judgmentCard : styles.judgmentListItem}
            key={judgment.id}
          >
            {compact ? (
              <>
                <div>
                  <StatusBadge status={judgment.status} />
                  <h3>{judgment.title}</h3>
                  <div className={styles.meta}>
                    <span>{judgment.caseNumber}</span>
                    <span>{judgment.courtName}</span>
                    <span>
                      <LocalTime dateOnly dateTime={judgment.decidedOn} />
                    </span>
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
                      href={`/p/${encodeURIComponent(judgment.id)}`}
                    >
                      판결문 보기
                    </a>
                    <NotifyButton
                      disabled={pendingNotificationId !== null}
                      isPending={pendingNotificationId === judgment.id}
                      onClick={() => subscribe(judgment.id)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={styles.judgmentListMain}>
                  <StatusBadge status={judgment.status} />
                  <a href={`/p/${encodeURIComponent(judgment.id)}`}>
                    {judgment.title}
                  </a>
                  <span>{judgment.caseNumber}</span>
                </div>
                <div className={styles.judgmentListMeta}>
                  <span>{judgment.courtName}</span>
                  <span>
                    <LocalTime dateOnly dateTime={judgment.decidedOn} />
                  </span>
                  <span>알림 {judgment.notificationCount}건</span>
                </div>
                <div className={styles.judgmentListActions}>
                  <a
                    className={styles.secondaryButton}
                    href={`/p/${encodeURIComponent(judgment.id)}`}
                  >
                    보기
                  </a>
                  <NotifyButton
                    disabled={pendingNotificationId !== null}
                    isPending={pendingNotificationId === judgment.id}
                    onClick={() => subscribe(judgment.id)}
                  />
                </div>
              </>
            )}
          </article>
        ))}
      </div>
      {!compact && totalCount > JUDGMENT_LIST_PAGE_SIZE && (
        <div className={styles.judgmentListFooter}>
          <div className={styles.listPager}>
            <button
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
              type="button"
            >
              이전
            </button>
            <span>
              {page} / {pageCount}
            </span>
            <button
              disabled={page >= pageCount}
              onClick={() => goToPage(page + 1)}
              type="button"
            >
              다음
            </button>
          </div>
        </div>
      )}
      {visibleJudgments.length === 0 && (
        <p className={styles.notice}>검색 조건에 맞는 판결문이 아직 없어요.</p>
      )}
      {(compact || !showWorkspace) && (
        <p className={styles.notice}>{message}</p>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: Judgment["status"] }) {
  return (
    <span
      className={
        status === "ready"
          ? styles.statusReady
          : status === "needs_review"
            ? styles.statusReview
            : styles.statusPending
      }
    >
      {status === "ready"
        ? "생성 완료"
        : status === "needs_review"
          ? "검토 필요"
          : "생성 대기"}
    </span>
  );
}

function NotifyButton({
  disabled,
  isPending,
  onClick,
}: {
  disabled: boolean;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={styles.secondaryButton}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {isPending ? "알림 등록 중" : "완료 알림 받기"}
    </button>
  );
}

function catalogPageHref({
  page,
  query,
  view,
}: {
  page: number;
  query: string;
  view?: "recent";
}) {
  const params = new URLSearchParams();
  if (query.trim()) {
    params.set("q", query.trim());
  }
  if (view) {
    params.set("view", view);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const queryString = params.toString();
  return queryString ? `/catalog?${queryString}` : "/catalog";
}
