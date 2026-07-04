"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { AltchaCaptcha } from "@/components/altcha-captcha";
import { CitationEvidenceModal } from "@/components/citation-evidence-modal";
import {
  type CitationEvidence,
  ResearchMarkdown,
} from "@/components/research-markdown";
import { clientFingerprintHeaders } from "@/lib/client-fingerprint";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import type { AnswerDetailLevel } from "@/lib/research-options";

type Plan = {
  coverageLabel: string;
  intent: string;
};

type ResearchRequest = {
  answerDetail: AnswerDetailLevel;
  captchaPayload?: string;
  easyExplanation: boolean;
  nonce: number;
  query: string;
};

type ResearchInputMode = "simple" | "structured";

type StructuredQuestion = {
  additional: string;
  how: string;
  what: string;
  when: string;
  where: string;
  who: string;
  why: string;
};

type AgentActivity = {
  detail: string;
  id: number;
  status: "completed" | "failed" | "running";
  title: string;
  type: "progress" | "skill" | "tool";
};

const emptyStructuredQuestion: StructuredQuestion = {
  additional: "",
  how: "",
  what: "",
  when: "",
  where: "",
  who: "",
  why: "",
};

const structuredQuestionFields: Array<{
  field: keyof StructuredQuestion;
  label: string;
}> = [
  { field: "who", label: "누가" },
  { field: "when", label: "언제" },
  { field: "where", label: "어디서" },
  { field: "what", label: "무엇을" },
  { field: "how", label: "어떻게" },
  { field: "why", label: "왜" },
  { field: "additional", label: "추가 설명" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readErrorBody(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

function errorCode(value: unknown) {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : undefined;
}

function errorBodyMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.message === "string"
    ? value.message
    : fallback;
}

function readableStreamError(value: unknown) {
  const fallback =
    "질문을 처리하지 못했어요. LLM 설정과 MCP 연결을 확인해 주세요.";
  if (!isRecord(value)) {
    return fallback;
  }
  const message = typeof value.message === "string" ? value.message : fallback;
  if (value.code === "llm_request_failed") {
    if (message.includes("초과")) {
      return `${message} 로컬 모델은 답변 생성에 시간이 오래 걸릴 수 있어요. 계속 반복되면 더 작은 모델로 바꾸거나 다시 시도해 주세요.`;
    }
    return `${message} 로컬 모델을 쓰는 경우 LLM 서버가 켜져 있는지, API Base URL과 모델명이 현재 서버와 맞는지 확인해 주세요.`;
  }
  if (value.code === "llm_response_invalid") {
    return `${message} LLM이 JSON/마크다운 형식을 지키지 못했습니다. 같은 질문을 다시 시도하거나 모델을 바꿔 보세요.`;
  }
  if (value.code === "mcp_unavailable") {
    return `${message} 관리자 MCP 검색 도구 설정이 필요합니다.`;
  }
  return message;
}

function exportFilename(query: string, extension: "md") {
  const title =
    query
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 32) || "easylaw-research";
  return `${title}.${extension}`;
}

function documentTitle(query: string) {
  return query.trim() || "EasyLaw AI 답변";
}

function structuredQuestionText(question: StructuredQuestion) {
  return structuredQuestionFields
    .flatMap(({ field, label }) => {
      const value = question[field].trim();
      return value ? [`${label}: ${value}`] : [];
    })
    .join("\n");
}

function currentAgentActivity(activities: AgentActivity[]) {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    if (activities[index]?.status === "running") {
      return activities[index];
    }
  }
  return activities.at(-1) ?? null;
}

function citedEvidence(answer: string, evidence: CitationEvidence[]) {
  const citedIds = new Set(
    [...answer.matchAll(/\[(E\d+)\]/g)].map((match) => match[1]),
  );
  const seen = new Set<string>();
  return evidence.filter((item) => {
    if (!citedIds.has(item.id)) {
      return false;
    }
    const key = item.url
      ? `url:${item.url
          .replace(/[?#].*$/, "")
          .replace(/\/+$/, "")
          .toLowerCase()}`
      : item.documentType === "dictionary"
        ? `dictionary:${item.source}:${item.title}`
        : `title:${item.title.replaceAll(/\s+/g, " ").trim().toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function researchMarkdown({
  answer,
  evidence,
  plan,
  query,
}: {
  answer: string;
  evidence: CitationEvidence[];
  plan: Plan | null;
  query: string;
}) {
  const sources = evidence
    .map((item) => {
      const url = item.url ? `\n  URL: ${item.url}` : "";
      return `- [${item.id}] ${item.title} (${item.source}, 신뢰도 ${item.confidence})\n  ${item.summary}${url}`;
    })
    .join("\n");
  return [
    "# EasyLaw AI 답변",
    "",
    `질문: ${query.trim()}`,
    plan ? `범위: ${plan.coverageLabel}` : null,
    plan ? `쟁점: ${plan.intent}` : null,
    "",
    "## 답변",
    "",
    answer.trim(),
    evidence.length > 0 ? "## 출처" : null,
    evidence.length > 0 ? "" : null,
    evidence.length > 0 ? sources : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function downloadTextFile(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sourceHtml(evidence: CitationEvidence[]) {
  if (evidence.length === 0) {
    return "";
  }
  const items = evidence
    .map(
      (item) => `<article>
  <strong>${escapeHtml(item.id)}. ${escapeHtml(item.title)}</strong>
  <small>${escapeHtml(item.source)} · 신뢰도 ${escapeHtml(item.confidence)}</small>
  <p>${escapeHtml(item.summary)}</p>
  ${
    item.url
      ? `<p><a href="${escapeHtml(item.url)}">${escapeHtml(item.url)}</a></p>`
      : ""
  }
</article>`,
    )
    .join("\n");
  return `<section class="print-sources"><h2>출처</h2>${items}</section>`;
}

function printableStyles() {
  const stylesheets = [...document.querySelectorAll("link[rel='stylesheet']")]
    .map((link) => {
      const href = link.getAttribute("href");
      return href ? `<link rel="stylesheet" href="${escapeHtml(href)}" />` : "";
    })
    .join("\n");
  const inlineStyles = [...document.querySelectorAll("style")]
    .map((style) => style.outerHTML)
    .join("\n");
  return `${stylesheets}\n${inlineStyles}`;
}

function printPdf({
  renderedHtml,
  title,
}: {
  renderedHtml: string;
  title: string;
}) {
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  ${printableStyles()}
  <style>
    body { margin: 0; background: #fff; color: #111; font-family: Arial, sans-serif; }
    main { max-width: 760px; margin: 0 auto; padding: 32px 0; }
    header { margin-bottom: 24px; border-bottom: 1px solid #111; padding-bottom: 14px; }
    header h1 { margin: 0 0 8px; font-size: 24px; line-height: 1.35; }
    header p { margin: 0; color: #555; font-size: 13px; line-height: 1.55; }
    .print-answer { font-size: 14px; line-height: 1.75; }
    .print-answer button { border: 0; padding: 0; background: transparent; color: inherit; font: inherit; }
    .print-answer [role="tooltip"] { display: none; }
    .print-answer table { width: 100%; border-collapse: collapse; }
    .print-answer th, .print-answer td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
    .print-sources { margin-top: 28px; border-top: 1px solid #ddd; padding-top: 18px; }
    .print-sources h2 { margin: 0 0 12px; font-size: 16px; }
    .print-sources article { break-inside: avoid; margin-top: 12px; }
    .print-sources strong, .print-sources small { display: block; }
    .print-sources small { color: #666; }
    .print-sources p { margin: 4px 0 0; }
    @page { margin: 18mm; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>EasyLaw AI 답변</h1>
      <p>${escapeHtml(title)}</p>
    </header>
    ${renderedHtml}
  </main>
  <script>window.addEventListener("load", () => window.print());</script>
</body>
</html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener,noreferrer");
}

export function LegalResearchPanel({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [inputMode, setInputMode] = useState<ResearchInputMode>("simple");
  const [structuredQuestion, setStructuredQuestion] =
    useState<StructuredQuestion>(emptyStructuredQuestion);
  const [answerDetail, setAnswerDetail] = useState<AnswerDetailLevel>("simple");
  const [easyExplanation, setEasyExplanation] = useState(false);
  const [activeRequest, setActiveRequest] = useState<ResearchRequest | null>(
    initialQuery
      ? {
          answerDetail: "simple",
          easyExplanation: false,
          nonce: 0,
          query: initialQuery,
        }
      : null,
  );
  const [plan, setPlan] = useState<Plan | null>(null);
  const [evidence, setEvidence] = useState<CitationEvidence[]>([]);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [warning, setWarning] = useState("");
  const [sourceEvidence, setSourceEvidence] = useState<CitationEvidence | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState(
    "질문을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error" | "captcha"
  >(initialQuery ? "loading" : "idle");
  const renderedAnswerRef = useRef<HTMLDivElement>(null);
  const submitGuardRef = useRef(false);
  const activityIdRef = useRef(0);
  const visibleEvidence = useMemo(
    () => citedEvidence(answer, evidence),
    [answer, evidence],
  );
  const submittedQuery =
    inputMode === "simple"
      ? query.trim()
      : structuredQuestionText(structuredQuestion);
  const activeActivity = currentAgentActivity(activities);

  const appendActivity = useCallback((activity: Omit<AgentActivity, "id">) => {
    setActivities((current) => {
      const existing = current.findIndex(
        (item) => item.title === activity.title && item.type === activity.type,
      );
      if (existing >= 0) {
        return current.map((item, index) =>
          index === existing ? { ...item, ...activity } : item,
        );
      }
      activityIdRef.current += 1;
      return [...current.slice(-7), { ...activity, id: activityIdRef.current }];
    });
  }, []);

  const applyServerEvent = useCallback(
    (eventText: string) => {
      const event = eventText.match(/^event: (.+)$/m)?.[1];
      const rawData = eventText.match(/^data: (.+)$/m)?.[1];
      if (!event || !rawData) {
        return;
      }
      const data = JSON.parse(rawData) as unknown;

      if (event === "plan") {
        setPlan(data as Plan);
      }
      if (event === "evidence") {
        setEvidence((current) => [...current, data as CitationEvidence]);
      }
      if (
        event === "answer" &&
        isRecord(data) &&
        typeof data.text === "string"
      ) {
        setAnswer(data.text);
      }
      if (event === "warning" && typeof data === "string") {
        setWarning(data);
      }
      if (
        event === "skill" &&
        isRecord(data) &&
        typeof data.title === "string" &&
        typeof data.detail === "string" &&
        isActivityStatus(data.stage)
      ) {
        appendActivity({
          detail: data.detail,
          status: data.stage,
          title: data.title,
          type: "skill",
        });
      }
      if (
        event === "progress" &&
        isRecord(data) &&
        typeof data.title === "string" &&
        typeof data.detail === "string" &&
        isActivityStatus(data.status)
      ) {
        appendActivity({
          detail: data.detail,
          status: data.status,
          title: data.title,
          type: "progress",
        });
      }
      if (
        event === "tool" &&
        isRecord(data) &&
        typeof data.tool === "string" &&
        typeof data.stage === "string"
      ) {
        setToolStatus(toolStatusLabel(data.stage));
        appendActivity({
          detail: toolActivityDetail(data.stage),
          status: toolActivityStatus(data.stage),
          title: data.tool,
          type: "tool",
        });
      }
      if (event === "phase" && typeof data === "string") {
        setPhase(data);
      }
      if (event === "done") {
        setStatus("done");
      }
      if (event === "error") {
        setErrorMessage(readableStreamError(data));
        setStatus("error");
      }
    },
    [appendActivity],
  );

  const runResearch = useCallback(
    async (researchRequest: ResearchRequest, signal: AbortSignal) => {
      setStatus("loading");
      setPlan(null);
      setEvidence([]);
      setAnswer("");
      setPhase("");
      setToolStatus("");
      setActivities([]);
      setWarning("");
      setSourceEvidence(null);

      try {
        const response = await fetch("/api/research/stream", {
          body: JSON.stringify({
            answerDetail: researchRequest.answerDetail,
            captchaPayload: researchRequest.captchaPayload,
            easyExplanation: researchRequest.easyExplanation,
            query: researchRequest.query,
          }),
          headers: {
            "Content-Type": "application/json",
            ...clientFingerprintHeaders(),
          },
          method: "POST",
          signal,
        });

        if (!response.ok || !response.body) {
          const errorBody = await readErrorBody(response);
          if (response.status === 403) {
            if (errorCode(errorBody) === "captcha_required") {
              setErrorMessage(
                errorBodyMessage(
                  errorBody,
                  "보안 확인을 완료하면 질문을 계속 처리할 수 있어요.",
                ),
              );
              setStatus("captcha");
              return;
            }
          }
          if (response.status === 429 || response.status === 401) {
            setErrorMessage(
              errorBodyMessage(
                errorBody,
                "비회원 이용 한도를 넘었어요. 잠시 후 다시 시도하거나 로그인해 주세요.",
              ),
            );
          } else if (response.status === 400) {
            setErrorMessage(
              `질문은 ${LEGAL_RESEARCH_QUERY_MAX_LENGTH.toLocaleString("ko-KR")}자 이내로 입력해 주세요.`,
            );
          } else if (response.status === 503) {
            setErrorMessage(
              errorBodyMessage(
                errorBody,
                "관리자 LLM 설정을 먼저 완료해 주세요.",
              ),
            );
          } else {
            setErrorMessage(
              "질문을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
            );
          }
          setStatus("error");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const eventText of events) {
            applyServerEvent(eventText);
          }
        }
      } catch (_error) {
        if (!signal.aborted) {
          setErrorMessage(
            "질문 처리 스트림이 중단됐어요. 네트워크 상태나 서버 로그를 확인해 주세요.",
          );
          setStatus("error");
        }
      }
    },
    [applyServerEvent],
  );

  useEffect(() => {
    if (!activeRequest) {
      return;
    }

    const abortController = new AbortController();
    void runResearch(activeRequest, abortController.signal);
    return () => abortController.abort();
  }, [activeRequest, runResearch]);

  const handleCaptchaVerified = useCallback(
    (payload: string) => {
      const nextQuery = activeRequest?.query ?? submittedQuery;
      if (!nextQuery) {
        return;
      }
      setActiveRequest({
        answerDetail: activeRequest?.answerDetail ?? answerDetail,
        captchaPayload: payload,
        easyExplanation: activeRequest?.easyExplanation ?? easyExplanation,
        nonce: Date.now(),
        query: nextQuery,
      });
    },
    [activeRequest, answerDetail, easyExplanation, submittedQuery],
  );

  const exportResearch = useCallback(
    (format: "markdown" | "pdf") => {
      const markdown = researchMarkdown({
        answer,
        evidence: visibleEvidence,
        plan,
        query: activeRequest?.query ?? query,
      });
      if (format === "markdown") {
        downloadTextFile(
          exportFilename(activeRequest?.query ?? query, "md"),
          markdown,
          "text/markdown;charset=utf-8",
        );
        return;
      }
      const renderedAnswer = renderedAnswerRef.current?.innerHTML;
      if (!renderedAnswer) {
        return;
      }
      printPdf({
        renderedHtml: `<section class="print-answer">${renderedAnswer}</section>${sourceHtml(visibleEvidence)}`,
        title: documentTitle(activeRequest?.query ?? query),
      });
    },
    [activeRequest?.query, answer, plan, query, visibleEvidence],
  );

  return (
    <div className={styles.researchShell}>
      <section className={styles.researchSearchPanel}>
        <span className={styles.previewLabel}>EasyLaw AI</span>
        <h1 data-i18n="research.title">AI 법률 질문</h1>
        <p data-i18n="research.description">
          궁금한 상황을 검색하듯 입력하면 AI 답변과 출처를 함께 보여줘요.
        </p>
        <form
          className={styles.researchSearchForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (submitGuardRef.current || status === "loading") {
              return;
            }
            if (submittedQuery) {
              submitGuardRef.current = true;
              setActiveRequest({
                answerDetail,
                easyExplanation,
                nonce: Date.now(),
                query: submittedQuery,
              });
              queueMicrotask(() => {
                submitGuardRef.current = false;
              });
            }
          }}
        >
          <fieldset className={styles.researchInputMode}>
            <legend>질문 입력 방식</legend>
            <div className={styles.researchSegmentedControl}>
              <label>
                <input
                  checked={inputMode === "simple"}
                  disabled={status === "loading"}
                  name="input-mode"
                  onChange={() => setInputMode("simple")}
                  type="radio"
                />
                <span>
                  <strong>간단 질문</strong>
                  <small>한 칸에 자유롭게 입력</small>
                </span>
              </label>
              <label>
                <input
                  checked={inputMode === "structured"}
                  disabled={status === "loading"}
                  name="input-mode"
                  onChange={() => setInputMode("structured")}
                  type="radio"
                />
                <span>
                  <strong>상세 입력</strong>
                  <small>육하원칙으로 나눠 입력</small>
                </span>
              </label>
            </div>
          </fieldset>
          {inputMode === "simple" ? (
            <textarea
              aria-label="AI 법률 질문"
              className={styles.researchQuestionTextarea}
              id="research-query"
              maxLength={LEGAL_RESEARCH_QUERY_MAX_LENGTH}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 중고거래 사기를 당했는데 신고와 배상 절차가 궁금합니다."
              value={query}
            />
          ) : (
            <div className={styles.researchStructuredInput}>
              {structuredQuestionFields.map(({ field, label }) => (
                <label
                  className={
                    field === "additional"
                      ? styles.researchStructuredAdditional
                      : undefined
                  }
                  htmlFor={`structured-question-${field}`}
                  key={field}
                >
                  <span>{label}</span>
                  {field === "who" || field === "when" || field === "where" ? (
                    <input
                      aria-label={`상세 질문 ${label}`}
                      disabled={status === "loading"}
                      id={`structured-question-${field}`}
                      maxLength={field === "where" ? 100 : 80}
                      onChange={(event) =>
                        setStructuredQuestion((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      placeholder={structuredPlaceholder(field)}
                      value={structuredQuestion[field]}
                    />
                  ) : (
                    <textarea
                      aria-label={`상세 질문 ${label}`}
                      disabled={status === "loading"}
                      id={`structured-question-${field}`}
                      maxLength={field === "additional" ? 220 : 250}
                      onChange={(event) =>
                        setStructuredQuestion((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                      placeholder={structuredPlaceholder(field)}
                      value={structuredQuestion[field]}
                    />
                  )}
                </label>
              ))}
            </div>
          )}
          {submittedQuery.length > LEGAL_RESEARCH_QUERY_MAX_LENGTH && (
            <p className={styles.researchInputWarning}>
              상세 입력 전체는{" "}
              {LEGAL_RESEARCH_QUERY_MAX_LENGTH.toLocaleString("ko-KR")}자
              이내여야 합니다.
            </p>
          )}
          <div className={styles.researchOptions}>
            <fieldset>
              <legend>받을 답변 형식</legend>
              <div className={styles.researchSegmentedControl}>
                <label>
                  <input
                    checked={answerDetail === "simple"}
                    disabled={status === "loading"}
                    name="answer-detail"
                    onChange={() => setAnswerDetail("simple")}
                    type="radio"
                  />
                  <span>
                    <strong>간단</strong>
                    <small>핵심만 줄글로</small>
                  </span>
                </label>
                <label>
                  <input
                    checked={answerDetail === "detailed"}
                    disabled={status === "loading"}
                    name="answer-detail"
                    onChange={() => setAnswerDetail("detailed")}
                    type="radio"
                  />
                  <span>
                    <strong>상세</strong>
                    <small>육하원칙·근거·추가 설명</small>
                  </span>
                </label>
              </div>
            </fieldset>
            <label className={styles.researchEasyToggle}>
              <input
                checked={easyExplanation}
                disabled={status === "loading"}
                onChange={(event) => setEasyExplanation(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>쉬운 설명</strong>
                <small>법령용어와 국어사전으로 어려운 말을 풀어요.</small>
              </span>
            </label>
          </div>
          <button
            className={styles.primaryButton}
            disabled={
              status === "loading" ||
              submittedQuery.length < 2 ||
              submittedQuery.length > LEGAL_RESEARCH_QUERY_MAX_LENGTH
            }
            type="submit"
          >
            {status === "loading" ? "근거 찾는 중" : "질문하기"}
          </button>
        </form>
      </section>

      <section className={styles.aiOverview} aria-live="polite">
        {status === "idle" && (
          <div className={styles.aiOverviewEmpty}>
            <strong>질문을 입력하면 AI 오버뷰가 열립니다.</strong>
            <span>핵심 답변과 확인 가능한 출처가 함께 나타나요.</span>
          </div>
        )}

        {status === "loading" && activities.length === 0 && (
          <div className={styles.aiSearchActivity}>
            <span aria-hidden="true" className={styles.aiSearchSpinner} />
            <div>
              <strong>{toolStatus || phaseLabel(phase)}</strong>
              <small>
                {answer
                  ? "앞 문단을 표시하면서 다음 문단을 이어 쓰고 있어요."
                  : "근거를 찾고 답변 경로를 고르는 중이에요."}
              </small>
            </div>
          </div>
        )}

        {activities.length > 0 && activeActivity && (
          <details className={styles.aiAgentTimeline}>
            <summary>
              <span
                aria-hidden="true"
                className={`${styles.aiAgentCurrentDot} ${
                  status === "loading" ? styles.aiAgentCurrentDotRunning : ""
                }`}
              >
                {activityStatusSymbol(activeActivity.status)}
              </span>
              <span
                className={styles.aiAgentCurrentCopy}
                key={`${activeActivity.id}-${activeActivity.status}-${activeActivity.detail}`}
              >
                <small>답변 준비 과정</small>
                <strong>{activeActivity.title}</strong>
                <span>{activeActivity.detail}</span>
              </span>
              <span className={styles.aiAgentTimelineState}>
                {status === "loading" ? "진행 중" : `${activities.length}단계`}
              </span>
              <span aria-hidden="true" className={styles.aiAgentChevron}>
                ⌄
              </span>
            </summary>
            <div className={styles.aiAgentTimelineDetails}>
              <span>
                {status === "loading"
                  ? "완료된 단계와 현재 작업"
                  : "답변을 만들 때 수행한 작업"}
              </span>
              <ol>
                {activities.map((activity) => (
                  <li
                    className={activityClassName(activity.status)}
                    key={activity.id}
                  >
                    <span aria-hidden="true">
                      {activityStatusSymbol(activity.status)}
                    </span>
                    <div>
                      <small>{activityTypeLabel(activity.type)}</small>
                      <strong>{activity.title}</strong>
                      <p>{activity.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        )}

        {plan && (
          <article className={styles.aiOverviewCard}>
            <header className={styles.aiOverviewHeader}>
              <div>
                <span className={styles.badge}>AI 오버뷰</span>
                <h2>{plan.coverageLabel}</h2>
              </div>
            </header>
            <div className={styles.aiOverviewMeta}>
              <span>{plan.intent}</span>
            </div>

            {answer && (
              <section className={styles.aiAnswerBlock}>
                <div className={styles.aiAnswerHeader}>
                  <div>
                    <h3>AI 답변</h3>
                    <span className={styles.aiAnswerMode}>
                      {activeRequest?.answerDetail === "detailed"
                        ? "상세 답변"
                        : "간단 답변"}
                      {activeRequest?.easyExplanation ? " · 쉬운 설명" : ""}
                    </span>
                  </div>
                  <div className={styles.aiExportActions}>
                    <button
                      onClick={() => exportResearch("markdown")}
                      type="button"
                    >
                      Markdown
                    </button>
                    <button onClick={() => exportResearch("pdf")} type="button">
                      PDF
                    </button>
                  </div>
                </div>
                <div ref={renderedAnswerRef}>
                  <ResearchMarkdown answer={answer} evidence={evidence} />
                </div>
                {status === "loading" && (
                  <span
                    aria-hidden="true"
                    className={styles.aiStreamingCursor}
                  />
                )}
              </section>
            )}

            {answer && visibleEvidence.length > 0 && (
              <section className={styles.aiSources}>
                <h3>답변에 인용된 출처 {visibleEvidence.length}개</h3>
                <div>
                  {visibleEvidence.map((item, index) => (
                    <article key={item.id}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {item.source} · 신뢰도 {item.confidence}
                        </small>
                        <p>{item.summary}</p>
                        <button
                          onClick={() => setSourceEvidence(item)}
                          type="button"
                        >
                          인용 상세 보기
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </article>
        )}

        {!plan && answer && (
          <article className={styles.aiOverviewCard}>
            <section className={styles.aiAnswerBlock}>
              <div className={styles.aiAnswerHeader}>
                <h3>AI 답변</h3>
                <div className={styles.aiExportActions}>
                  <button
                    onClick={() => exportResearch("markdown")}
                    type="button"
                  >
                    Markdown
                  </button>
                  <button onClick={() => exportResearch("pdf")} type="button">
                    PDF
                  </button>
                </div>
              </div>
              <div ref={renderedAnswerRef}>
                <ResearchMarkdown answer={answer} evidence={evidence} />
              </div>
            </section>
          </article>
        )}

        {status === "loading" && answer && (
          <div className={styles.aiStreamingNotice}>
            <span />
            {phase === "verifying"
              ? "고위험 쟁점을 한 번 더 확인하는 중이에요."
              : "다음 문단을 이어서 생성하는 중이에요."}
          </div>
        )}

        {status === "error" && <p className={styles.notice}>{errorMessage}</p>}
        {warning && <p className={styles.notice}>{warning}</p>}
        {status === "captcha" && (
          <>
            <p className={styles.notice}>{errorMessage}</p>
            <AltchaCaptcha
              onVerified={handleCaptchaVerified}
              resetKey={activeRequest?.nonce}
            />
          </>
        )}
        {sourceEvidence && (
          <CitationEvidenceModal
            evidence={sourceEvidence}
            onClose={() => setSourceEvidence(null)}
          />
        )}
      </section>
    </div>
  );
}

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    composing: "답변을 작성하는 중이에요.",
    connecting: "검색 준비 중이에요.",
    planning: "질문을 살펴보는 중이에요.",
    retrieving: "관련 근거를 더 찾는 중이에요.",
    verifying: "답변을 한 번 더 확인하는 중이에요.",
  };
  return labels[phase] ?? "법률 질문을 처리하는 중이에요.";
}

function structuredPlaceholder(field: keyof StructuredQuestion) {
  const placeholders: Record<keyof StructuredQuestion, string> = {
    additional: "피해, 증거, 원하는 해결 방법 등 더 설명할 내용을 적어 주세요.",
    how: "어떤 방식으로 일이 진행됐나요?",
    what: "무슨 일이 있었나요?",
    when: "예: 2026년 7월 3일 저녁",
    where: "예: 온라인 중고거래 앱",
    who: "예: 구매자인 나와 판매자",
    why: "알고 있는 이유나 상대방의 설명이 있나요?",
  };
  return placeholders[field];
}

function toolStatusLabel(stage: string) {
  if (stage === "calling") {
    return "관련 근거를 찾는 중이에요.";
  }
  if (stage === "completed") {
    return "찾은 근거를 확인했어요.";
  }
  return "다른 근거 경로를 확인하고 있어요.";
}

function isActivityStatus(value: unknown): value is AgentActivity["status"] {
  return value === "completed" || value === "failed" || value === "running";
}

function toolActivityStatus(stage: string): AgentActivity["status"] {
  if (stage === "completed") {
    return "completed";
  }
  if (stage === "failed") {
    return "failed";
  }
  return "running";
}

function toolActivityDetail(stage: string) {
  if (stage === "completed") {
    return "도구 결과를 받아 근거 후보로 반영했습니다.";
  }
  if (stage === "failed") {
    return "이 도구 호출은 실패했고 다른 경로를 계속 확인합니다.";
  }
  return "도구를 호출하고 결과를 기다립니다.";
}

function activityTypeLabel(type: AgentActivity["type"]) {
  if (type === "skill") {
    return "Skill";
  }
  if (type === "tool") {
    return "Tool";
  }
  return "Run";
}

function activityStatusSymbol(status: AgentActivity["status"]) {
  if (status === "completed") {
    return "✓";
  }
  if (status === "failed") {
    return "!";
  }
  return "·";
}

function activityClassName(status: AgentActivity["status"]) {
  if (status === "completed") {
    return `${styles.aiAgentTimelineItem} ${styles.aiAgentTimelineDone}`;
  }
  if (status === "failed") {
    return `${styles.aiAgentTimelineItem} ${styles.aiAgentTimelineFailed}`;
  }
  return styles.aiAgentTimelineItem;
}
