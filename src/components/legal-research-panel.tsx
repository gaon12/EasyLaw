"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { AltchaCaptcha } from "@/components/altcha-captcha";
import {
  type CitationEvidence,
  ResearchMarkdown,
} from "@/components/research-markdown";
import { clientFingerprintHeaders } from "@/lib/client-fingerprint";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";

type Plan = {
  coverageLabel: string;
  intent: string;
};

type ResearchRequest = {
  captchaPayload?: string;
  nonce: number;
  query: string;
};

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

function printPdf(markdown: string) {
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>EasyLaw AI 답변</title>
  <style>
    body { margin: 32px; color: #111; font-family: Arial, sans-serif; line-height: 1.7; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; }
    @page { margin: 18mm; }
  </style>
</head>
<body>
  <pre>${escapeHtml(markdown)}</pre>
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
  const [activeRequest, setActiveRequest] = useState<ResearchRequest | null>(
    initialQuery ? { nonce: 0, query: initialQuery } : null,
  );
  const [plan, setPlan] = useState<Plan | null>(null);
  const [evidence, setEvidence] = useState<CitationEvidence[]>([]);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [errorMessage, setErrorMessage] = useState(
    "질문을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "done" | "error" | "captcha"
  >(initialQuery ? "loading" : "idle");
  const submitGuardRef = useRef(false);

  const applyServerEvent = useCallback((eventText: string) => {
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
    if (event === "answer" && isRecord(data) && typeof data.text === "string") {
      setAnswer(data.text);
    }
    if (event === "warning" && typeof data === "string") {
      setWarning(data);
    }
    if (
      event === "tool" &&
      isRecord(data) &&
      typeof data.tool === "string" &&
      typeof data.stage === "string"
    ) {
      setToolStatus(toolStatusLabel(data.stage));
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
  }, []);

  const runResearch = useCallback(
    async (nextQuery: string, signal: AbortSignal, captchaPayload?: string) => {
      setStatus("loading");
      setPlan(null);
      setEvidence([]);
      setAnswer("");
      setPhase("");
      setToolStatus("");
      setWarning("");

      try {
        const response = await fetch("/api/research/stream", {
          body: JSON.stringify({ captchaPayload, query: nextQuery }),
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
    void runResearch(
      activeRequest.query,
      abortController.signal,
      activeRequest.captchaPayload,
    );
    return () => abortController.abort();
  }, [activeRequest, runResearch]);

  const handleCaptchaVerified = useCallback(
    (payload: string) => {
      const nextQuery = activeRequest?.query ?? query.trim();
      if (!nextQuery) {
        return;
      }
      setActiveRequest({
        captchaPayload: payload,
        nonce: Date.now(),
        query: nextQuery,
      });
    },
    [activeRequest?.query, query],
  );

  const exportResearch = useCallback(
    (format: "markdown" | "pdf") => {
      const markdown = researchMarkdown({
        answer,
        evidence,
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
      printPdf(markdown);
    },
    [activeRequest?.query, answer, evidence, plan, query],
  );

  return (
    <div className={styles.researchShell}>
      <section className={styles.researchSearchPanel}>
        <span className={styles.previewLabel}>EasyLaw AI</span>
        <h1>AI 법률 질문</h1>
        <p>궁금한 상황을 검색하듯 입력하면 AI 답변과 출처를 함께 보여줘요.</p>
        <form
          className={styles.researchSearchForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (submitGuardRef.current || status === "loading") {
              return;
            }
            if (query.trim()) {
              submitGuardRef.current = true;
              setActiveRequest({
                nonce: Date.now(),
                query: query.trim(),
              });
              queueMicrotask(() => {
                submitGuardRef.current = false;
              });
            }
          }}
        >
          <textarea
            aria-label="AI 법률 질문"
            id="research-query"
            maxLength={LEGAL_RESEARCH_QUERY_MAX_LENGTH}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 중고거래 사기를 당했는데 신고와 배상 절차가 궁금합니다."
            value={query}
          />
          <button
            className={styles.primaryButton}
            disabled={status === "loading" || query.trim().length < 2}
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

        {status === "loading" && (
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
                <ResearchMarkdown answer={answer} evidence={evidence} />
                {status === "loading" && (
                  <span
                    aria-hidden="true"
                    className={styles.aiStreamingCursor}
                  />
                )}
              </section>
            )}

            {answer && evidence.length > 0 && (
              <section className={styles.aiSources}>
                <h3>출처 {evidence.length}개</h3>
                <div>
                  {evidence.map((item, index) => (
                    <article key={`${item.source}-${item.title}`}>
                      <span>{index + 1}</span>
                      <div>
                        {item.url ? (
                          <a href={item.url} rel="noreferrer" target="_blank">
                            <strong>{item.title}</strong>
                          </a>
                        ) : (
                          <strong>{item.title}</strong>
                        )}
                        <small>
                          {item.source} · 신뢰도 {item.confidence}
                        </small>
                        <p>{item.summary}</p>
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
              <ResearchMarkdown answer={answer} evidence={evidence} />
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

function toolStatusLabel(stage: string) {
  if (stage === "calling") {
    return "관련 근거를 찾는 중이에요.";
  }
  if (stage === "completed") {
    return "찾은 근거를 확인했어요.";
  }
  return "다른 근거 경로를 확인하고 있어요.";
}
