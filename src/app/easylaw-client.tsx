"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { AltchaCaptcha } from "@/components/altcha-captcha";
import { LoginRequiredModal } from "@/components/auth-required-link";
import { BookmarkButton } from "@/components/bookmark-button";
import { SearchIcon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { clientFingerprintHeaders } from "@/lib/client-fingerprint";
import {
  CUSTOM_JUDGMENT_TEXT_MAX_LENGTH,
  CUSTOM_JUDGMENT_TITLE_MAX_LENGTH,
  JUDGMENT_SEARCH_QUERY_MAX_LENGTH,
} from "@/lib/input-limits";
import {
  displayJudgmentCaseType,
  displayJudgmentCategory,
  JUDGMENT_SORT_OPTIONS,
  type JudgmentCaseTypeFilter,
  type JudgmentCategoryFilter,
  type JudgmentSearchFilters,
  type JudgmentSortOption,
  judgmentCategory,
} from "@/lib/judgment-search";
import type { JudgmentListItem } from "@/lib/types";
import styles from "./page.module.css";

const JUDGMENT_LIST_PAGE_SIZE = 15;
const ALL_CATEGORIES: JudgmentCategoryFilter[] = ["judgment", "law"];
const SKELETON_ROWS = ["s1", "s2", "s3", "s4", "s5"];

const caseTypeOptions: JudgmentCaseTypeFilter[] = [
  "civil",
  "criminal",
  "administrative",
  "family",
  "constitutional",
];

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

function isCustomJudgmentResponse(
  value: unknown,
): value is CustomJudgmentResponse {
  return isRecord(value) && typeof value.href === "string";
}

function clampYear(year: number) {
  return Math.min(2100, Math.max(1900, year));
}

export function JudgmentExplorer({
  initialFilters,
  initialJudgments,
  initialPage = 1,
  initialTotalCount = initialJudgments.length,
  initialView,
  initialBookmarkedIds = [],
  showWorkspace = true,
}: {
  initialBookmarkedIds?: string[];
  initialFilters?: JudgmentSearchFilters;
  initialJudgments: Judgment[];
  initialPage?: number;
  initialTotalCount?: number;
  initialView?: "recent";
  showWorkspace?: boolean;
}) {
  const [query, setQuery] = useState(initialFilters?.text ?? "");
  const [categories, setCategories] = useState<JudgmentCategoryFilter[]>(
    initialFilters?.categories?.length
      ? initialFilters.categories
      : ALL_CATEGORIES,
  );
  const [sort, setSort] = useState<JudgmentSortOption>(
    initialFilters?.sort ?? "newest",
  );
  const [caseTypeFilter, setCaseTypeFilter] = useState<
    JudgmentCaseTypeFilter | ""
  >(
    initialFilters?.caseType && initialFilters.caseType !== "law"
      ? initialFilters.caseType
      : "",
  );
  const [yearFrom, setYearFrom] = useState(
    initialFilters?.yearFrom ? String(initialFilters.yearFrom) : "",
  );
  const [yearTo, setYearTo] = useState(
    initialFilters?.yearTo ? String(initialFilters.yearTo) : "",
  );
  const [optionsOpen, setOptionsOpen] = useState(
    Boolean(
      initialFilters?.caseType ||
        initialFilters?.yearFrom ||
        initialFilters?.yearTo,
    ),
  );
  const [judgments, setJudgments] = useState(initialJudgments);
  const [page, setPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [hasClientResults, setHasClientResults] = useState(false);
  const [message, setMessage] = useState(
    "확인된 판결문·법령 정보를 기준으로 검색해요.",
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const searchSeqRef = useRef(0);
  const skipAutoSearchRef = useRef(true);
  const skipYearSearchRef = useRef(true);
  const savingRef = useRef(false);
  const authRedirectRef = useRef(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customText, setCustomText] = useState("");
  const [customTextNotice, setCustomTextNotice] = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const customDetailsRef = useRef<HTMLDetailsElement>(null);
  const [captchaPrompt, setCaptchaPrompt] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    if (
      window.location.hash === "#custom-judgment" &&
      customDetailsRef.current
    ) {
      customDetailsRef.current.open = true;
      customDetailsRef.current.scrollIntoView();
    }
  }, []);

  function buildSearchBody():
    | { error: string }
    | { body: Record<string, unknown> } {
    const from = yearFrom.trim();
    const to = yearTo.trim();
    if ((from && from.length !== 4) || (to && to.length !== 4)) {
      return { error: "연도는 4자리 숫자로 입력해 주세요." };
    }
    const fromYear = from ? clampYear(Number(from)) : undefined;
    const toYear = to ? clampYear(Number(to)) : undefined;
    if (fromYear && toYear && fromYear > toYear) {
      return { error: "시작 연도가 끝 연도보다 클 수 없어요." };
    }
    return {
      body: {
        query: query.trim(),
        categories:
          categories.length === ALL_CATEGORIES.length ? undefined : categories,
        caseType: caseTypeFilter || undefined,
        yearFrom: fromYear,
        yearTo: toYear,
        sort: sort === "newest" ? undefined : sort,
      },
    };
  }

  function catalogParams(pageNumber?: number) {
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (categories.length !== ALL_CATEGORIES.length) {
      params.set("cat", categories.join(","));
    }
    if (caseTypeFilter) {
      params.set("type", caseTypeFilter);
    }
    if (yearFrom.trim().length === 4) {
      params.set("from", yearFrom.trim());
    }
    if (yearTo.trim().length === 4) {
      params.set("to", yearTo.trim());
    }
    if (sort !== "newest") {
      params.set("sort", sort);
    }
    if (initialView && !query.trim()) {
      params.set("view", initialView);
    }
    if (pageNumber && pageNumber > 1) {
      params.set("page", String(pageNumber));
    }
    return params.toString();
  }

  async function search(captchaPayload?: string) {
    const built = buildSearchBody();
    if ("error" in built) {
      setMessage(built.error);
      return;
    }

    const seq = ++searchSeqRef.current;
    setIsSearching(true);
    setMessage("조건에 맞는 문서를 확인하고 있어요.");
    try {
      const response = await fetch("/api/judgments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...clientFingerprintHeaders(),
        },
        body: JSON.stringify({ captchaPayload, ...built.body }),
      });
      const data: unknown = await response.json();
      if (seq !== searchSeqRef.current) {
        return;
      }

      if (
        response.status === 403 &&
        stringField(data, "error") === "captcha_required"
      ) {
        setCaptchaPrompt(
          apiMessage(data, "보안 확인을 완료하면 검색을 계속할 수 있어요."),
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
          ? `${data.count}개의 문서를 찾았어요.`
          : "검색 조건에 맞는 문서가 없어요.",
      );
      const params = catalogParams();
      window.history.replaceState(
        null,
        "",
        params ? `/catalog?${params}` : "/catalog",
      );
    } catch (_error) {
      if (seq === searchSeqRef.current) {
        setMessage("요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      }
    } finally {
      if (seq === searchSeqRef.current) {
        setIsSearching(false);
      }
    }
  }

  // 카테고리·정렬·사건 종류는 바꾸는 즉시 새로 조회한다.
  const categoriesKey = categories.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: 옵션 변경에만 반응한다.
  useEffect(() => {
    if (skipAutoSearchRef.current) {
      skipAutoSearchRef.current = false;
      return;
    }
    void search();
  }, [categoriesKey, sort, caseTypeFilter]);

  // 연도 입력은 잠시 기다렸다가 조회한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 연도 변경에만 반응한다.
  useEffect(() => {
    if (skipYearSearchRef.current) {
      skipYearSearchRef.current = false;
      return;
    }
    const timer = setTimeout(() => void search(), 600);
    return () => clearTimeout(timer);
  }, [yearFrom, yearTo]);

  function toggleCategory(category: JudgmentCategoryFilter) {
    setCategories((current) => {
      if (current.includes(category)) {
        if (current.length === 1) {
          setMessage("카테고리는 하나 이상 선택해야 해요.");
          return current;
        }
        return current.filter((entry) => entry !== category);
      }
      return ALL_CATEGORIES.filter(
        (entry) => current.includes(entry) || entry === category,
      );
    });
  }

  const activeFilterCount =
    (caseTypeFilter ? 1 : 0) + (yearFrom.trim() || yearTo.trim() ? 1 : 0);

  function resetSearchOptions() {
    setCaseTypeFilter("");
    setYearFrom("");
    setYearTo("");
  }

  async function withSaving(action: () => Promise<void>) {
    if (savingRef.current || authRedirectRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      await action();
    } catch (_error) {
      setCustomTextNotice(
        "요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
    } finally {
      savingRef.current = false;
      if (!authRedirectRef.current) {
        setIsSaving(false);
      }
    }
  }

  async function extractPdfText(file: File) {
    await withSaving(async () => {
      setCustomTextNotice("PDF에서 텍스트를 추출하고 있어요.");
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/custom-judgments/extract", {
        body: formData,
        method: "POST",
      });
      const data: unknown = await response.json();

      if (response.status === 401) {
        authRedirectRef.current = true;
        setLoginModalOpen(true);
        return;
      }
      if (!response.ok) {
        setCustomTextNotice(
          apiMessage(data, "PDF에서 텍스트를 추출하지 못했어요."),
        );
        return;
      }
      const text = stringField(data, "text");
      if (!text) {
        setCustomTextNotice("PDF 응답 형식을 확인하지 못했어요.");
        return;
      }
      setCustomText(text);
      if (!customTitle.trim()) {
        setCustomTitle(file.name.replace(/\.pdf$/i, "").slice(0, 80));
      }
      const truncated =
        isRecord(data) && data.truncated === true
          ? " 내용이 길어 뒷부분은 잘렸어요."
          : "";
      setCustomTextNotice(
        `PDF에서 텍스트를 불러왔어요. 내용을 확인한 뒤 저장해 주세요.${truncated}`,
      );
    });
  }

  async function createCustomJudgment() {
    await withSaving(async () => {
      setCustomTextNotice("비공개 판결문을 저장하고 있어요.");
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
        setCustomTextNotice("제목과 판결문 내용을 확인해 주세요.");
        return;
      }
      if (!isCustomJudgmentResponse(data)) {
        setCustomTextNotice(
          "저장 응답 형식을 확인하지 못했어요. 다시 시도해 주세요.",
        );
        return;
      }
      window.location.assign(data.href);
    });
  }

  const usesServerPaging = !hasClientResults;
  const totalCount = usesServerPaging ? initialTotalCount : judgments.length;
  const pageCount = Math.max(
    1,
    Math.ceil(totalCount / JUDGMENT_LIST_PAGE_SIZE),
  );
  const pagedJudgments = usesServerPaging
    ? judgments
    : judgments.slice(
        (page - 1) * JUDGMENT_LIST_PAGE_SIZE,
        page * JUDGMENT_LIST_PAGE_SIZE,
      );

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  function goToPage(nextPage: number) {
    const safePage = Math.min(pageCount, Math.max(1, nextPage));
    setPageInput(String(safePage));
    if (usesServerPaging) {
      if (safePage === page) {
        return;
      }
      const params = catalogParams(safePage);
      window.location.assign(params ? `/catalog?${params}` : "/catalog");
      return;
    }
    setPage(safePage);
  }

  function submitPageJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedPage = Number.parseInt(pageInput, 10);
    if (!Number.isInteger(requestedPage)) {
      setPageInput(String(page));
      return;
    }
    goToPage(requestedPage);
  }

  const pager = (
    <div className={styles.listPager}>
      <button
        disabled={page <= 1 || isSearching}
        onClick={() => goToPage(page - 1)}
        type="button"
      >
        이전
      </button>
      <span>
        {page} / {pageCount}
      </span>
      <form className={styles.pageJumpForm} onSubmit={submitPageJump}>
        <label>
          <span className={styles.visuallyHidden}>이동할 페이지</span>
          <input
            aria-label="이동할 페이지"
            disabled={isSearching}
            inputMode="numeric"
            max={pageCount}
            min={1}
            onChange={(event) =>
              setPageInput(event.target.value.replace(/\D/g, ""))
            }
            type="number"
            value={pageInput}
          />
        </label>
        <button
          className={styles.pageJumpButton}
          disabled={isSearching}
          type="submit"
        >
          이동
        </button>
      </form>
      <button
        disabled={page >= pageCount || isSearching}
        onClick={() => goToPage(page + 1)}
        type="button"
      >
        다음
      </button>
    </div>
  );

  return (
    <>
      <LoginRequiredModal
        nextPath="/catalog#custom-judgment"
        onClose={() => {
          authRedirectRef.current = false;
          setIsSaving(false);
          setLoginModalOpen(false);
        }}
        open={loginModalOpen}
      />
      {showWorkspace && (
        <div className={styles.workspace}>
          <form
            className={styles.searchForm}
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <input
              aria-label="판결문·법령 검색어"
              maxLength={JUDGMENT_SEARCH_QUERY_MAX_LENGTH}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="사건번호, 법원명, 판결문·법령 제목을 입력하세요"
              value={query}
            />
            <button
              aria-label="검색"
              className={styles.searchButton}
              disabled={isSearching}
              type="submit"
            >
              <SearchIcon size={22} />
            </button>
          </form>
          <div className={styles.searchControlRow}>
            <fieldset className={styles.categoryChips}>
              <legend className={styles.visuallyHidden}>문서 카테고리</legend>
              {ALL_CATEGORIES.map((category) => (
                <label
                  className={styles.categoryChip}
                  data-category={category}
                  key={category}
                >
                  <input
                    checked={categories.includes(category)}
                    onChange={() => toggleCategory(category)}
                    type="checkbox"
                  />
                  <span>{displayJudgmentCategory(category)}</span>
                </label>
              ))}
            </fieldset>
            <label className={styles.sortControl}>
              <span className={styles.visuallyHidden}>정렬 기준</span>
              <select
                aria-label="정렬 기준"
                onChange={(event) =>
                  setSort(event.target.value as JudgmentSortOption)
                }
                value={sort}
              >
                {JUDGMENT_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-expanded={optionsOpen}
              className={styles.searchOptionsToggle}
              onClick={() => setOptionsOpen((current) => !current)}
              type="button"
            >
              검색 옵션
              {activeFilterCount > 0 && ` ${activeFilterCount}개 적용`}
              <span aria-hidden className={styles.searchOptionsCaret}>
                ▾
              </span>
            </button>
            <p aria-live="polite" className={styles.workspaceStatus}>
              {message}
            </p>
          </div>
          {optionsOpen && (
            <div className={styles.searchOptionsPanel}>
              <label className={styles.searchOptionField}>
                <span>사건 종류 (판결문)</span>
                <select
                  className={styles.input}
                  onChange={(event) =>
                    setCaseTypeFilter(
                      event.target.value as JudgmentCaseTypeFilter | "",
                    )
                  }
                  value={caseTypeFilter}
                >
                  <option value="">전체</option>
                  {caseTypeOptions.map((caseType) => (
                    <option key={caseType} value={caseType}>
                      {displayJudgmentCaseType(caseType)}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.searchOptionField}>
                <span>선고 연도</span>
                <div className={styles.yearRangeRow}>
                  <input
                    aria-label="선고 연도 시작"
                    className={styles.input}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(event) =>
                      setYearFrom(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="예: 2020"
                    value={yearFrom}
                  />
                  <span aria-hidden>~</span>
                  <input
                    aria-label="선고 연도 끝"
                    className={styles.input}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(event) =>
                      setYearTo(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="예: 2026"
                    value={yearTo}
                  />
                </div>
              </div>
              {activeFilterCount > 0 && (
                <div className={styles.searchOptionsActions}>
                  <button
                    className={styles.searchOptionsReset}
                    onClick={resetSearchOptions}
                    type="button"
                  >
                    옵션 초기화
                  </button>
                </div>
              )}
            </div>
          )}
          {captchaPrompt && (
            <div className={styles.workspaceNotice}>
              <p>{captchaPrompt}</p>
              <AltchaCaptcha
                onVerified={(payload) => void search(payload)}
                resetKey={captchaResetKey}
              />
            </div>
          )}
          <details
            className={styles.customJudgmentDetails}
            id="custom-judgment"
            ref={customDetailsRef}
          >
            <summary>
              <span className={styles.customJudgmentSummaryText}>
                <strong>내 판결문 직접 등록</strong>
                <small>
                  공개 목록에 없는 판결문은 PDF나 붙여넣기로 저장해요. 저장한
                  문서는 내 계정에서만 보여요.
                </small>
              </span>
              <span aria-hidden className={styles.searchOptionsCaret}>
                ▾
              </span>
            </summary>
            <div className={styles.customJudgmentBody}>
              <div className={styles.buttonRow}>
                <input
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                      void extractPdfText(file);
                    }
                  }}
                  ref={pdfInputRef}
                  type="file"
                />
                <button
                  className={styles.secondaryButton}
                  disabled={isSaving}
                  onClick={() => pdfInputRef.current?.click()}
                  type="button"
                >
                  PDF에서 불러오기
                </button>
              </div>
              {customTextNotice && (
                <p className={styles.notice}>{customTextNotice}</p>
              )}
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
                  className={styles.primaryButton}
                  disabled={
                    isSaving ||
                    customTitle.trim().length < 2 ||
                    customText.trim().length < 20
                  }
                  onClick={createCustomJudgment}
                  type="button"
                >
                  비공개 판결문 저장
                </button>
              </div>
            </div>
          </details>
        </div>
      )}

      {isSearching ? (
        <div aria-hidden className={styles.judgmentList}>
          {SKELETON_ROWS.map((row) => (
            <div className={styles.judgmentSkeletonItem} key={row}>
              <span className={styles.skeletonBadge} />
              <span className={styles.skeletonTitle} />
              <span className={styles.skeletonMeta} />
            </div>
          ))}
        </div>
      ) : (
        <section
          aria-label="판결문·법령 검색 결과"
          className={styles.judgmentResultsArea}
        >
          {judgments.length > 0 && (
            <div className={styles.judgmentListHeader}>
              <span>{totalCount.toLocaleString("ko-KR")}건</span>
              {pager}
            </div>
          )}
          <div className={styles.judgmentList}>
            {pagedJudgments.map((judgment) => (
              <article className={styles.judgmentListItem} key={judgment.id}>
                <div className={styles.judgmentListMain}>
                  <span
                    className={styles.categoryBadge}
                    data-category={judgmentCategory(judgment.caseType)}
                  >
                    {judgment.caseType === "law"
                      ? "법령"
                      : displayJudgmentCaseType(judgment.caseType)}
                  </span>
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
                </div>
                <div className={styles.judgmentListActions}>
                  <a
                    className={styles.primaryButton}
                    href={`/p/${encodeURIComponent(judgment.id)}`}
                  >
                    보기
                  </a>
                  <BookmarkButton
                    initialActive={initialBookmarkedIds.includes(judgment.id)}
                    judgmentId={judgment.id}
                  />
                </div>
              </article>
            ))}
          </div>
          {totalCount > JUDGMENT_LIST_PAGE_SIZE && (
            <div className={styles.judgmentListFooter}>{pager}</div>
          )}
          {judgments.length === 0 && (
            <p className={styles.notice}>
              검색 조건에 맞는 문서가 아직 없어요.
            </p>
          )}
        </section>
      )}
      {!showWorkspace && <p className={styles.notice}>{message}</p>}
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
