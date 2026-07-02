"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { AltchaCaptcha } from "@/components/altcha-captcha";
import {
  type CitationEvidence,
  ResearchMarkdown,
} from "@/components/research-markdown";
import { clientFingerprintHeaders } from "@/lib/client-fingerprint";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";

type ResearchStep = {
  id: string;
  label: string;
  description: string;
};

type Plan = {
  assumptions: string[];
  coverageLabel: string;
  coverageLevel: number;
  hypothetical: boolean;
  intent: string;
  legalIssues: string[];
  mode: "quick" | "overview" | "deep";
  steps: ResearchStep[];
};

type LlmSettings = {
  model: string;
  provider: string;
  reasoningMode: "not_requested";
};

type ProcessItem = {
  detail: string;
  status: "completed" | "running";
  title: string;
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
    return `${message} LLM API 주소, 모델명, API 키가 현재 설정과 맞는지 확인해 주세요.`;
  }
  if (value.code === "llm_response_invalid") {
    return `${message} LLM이 JSON/마크다운 형식을 지키지 못했습니다. 같은 질문을 다시 시도하거나 모델을 바꿔 보세요.`;
  }
  if (value.code === "mcp_unavailable") {
    return `${message} 관리자 MCP 검색 도구 설정이 필요합니다.`;
  }
  return message;
}

function upsertProcessItem(current: ProcessItem[], next: ProcessItem) {
  const index = current.findIndex((item) => item.title === next.title);
  if (index === -1) {
    return [...current, next];
  }
  return current.map((item, itemIndex) => (itemIndex === index ? next : item));
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
  const [llmSettings, setLlmSettings] = useState<LlmSettings | null>(null);
  const [processItems, setProcessItems] = useState<ProcessItem[]>([]);
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
    if (event === "settings" && isRecord(data)) {
      const settings = data as LlmSettings;
      setLlmSettings(settings);
      setProcessItems((current) =>
        upsertProcessItem(current, {
          detail: `${settings.provider} · ${settings.model} · reasoning 파라미터 미사용`,
          status: "completed",
          title: "LLM 설정 확인",
        }),
      );
    }
    if (event === "progress" && isRecord(data)) {
      setProcessItems((current) =>
        upsertProcessItem(current, {
          detail: typeof data.detail === "string" ? data.detail : "",
          status: data.status === "completed" ? "completed" : "running",
          title:
            typeof data.title === "string" ? data.title : "처리 상태 업데이트",
        }),
      );
    }
    if (event === "evidence") {
      setEvidence((current) => [...current, data as CitationEvidence]);
      setProcessItems((current) =>
        upsertProcessItem(current, {
          detail: "MCP 검색 결과에서 인용 가능한 근거를 추렸습니다.",
          status: "running",
          title: "근거 후보 수집",
        }),
      );
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
      const label = toolStatusLabel(data.tool, data.stage);
      setToolStatus(label);
      setProcessItems((current) =>
        upsertProcessItem(current, {
          detail: label,
          status: data.stage === "completed" ? "completed" : "running",
          title: "MCP 검색",
        }),
      );
    }
    if (event === "phase" && typeof data === "string") {
      setPhase(data);
      setProcessItems((current) =>
        upsertProcessItem(current, {
          detail: phaseLabel(data),
          status: "running",
          title: phaseTitle(data),
        }),
      );
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
      setLlmSettings(null);
      setProcessItems([]);

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

  const skeletonRows = useMemo(
    () => Array.from({ length: 4 }, (_, index) => index),
    [],
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
            <span aria-hidden="true" className={styles.aiSearchPulse}>
              <span />
              <span />
              <span />
            </span>
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

        {status === "loading" && !answer && !plan && (
          <div className={styles.skeletonStack}>
            {skeletonRows.map((row) => (
              <span key={row} />
            ))}
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
              <span>{modeLabel(plan.mode)}</span>
              {plan.hypothetical && <span>가상 사실 전제</span>}
              {llmSettings && (
                <span>{llmSettings.provider} · reasoning 요청 없음</span>
              )}
            </div>

            {(processItems.length > 0 || plan.legalIssues.length > 0) && (
              <section className={styles.aiProcessPanel}>
                <h3>진행 중인 과정</h3>
                <div className={styles.aiProcessList}>
                  {processItems.map((item) => (
                    <article
                      className={
                        item.status === "running"
                          ? styles.aiProcessActive
                          : undefined
                      }
                      key={item.title}
                    >
                      <span />
                      <div>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </div>
                    </article>
                  ))}
                </div>
                {plan.legalIssues.length > 0 && (
                  <div className={styles.aiIssueChips}>
                    {plan.legalIssues.map((issue) => (
                      <span key={issue}>{issue}</span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {(answer || status === "loading") && (
              <section className={styles.aiAnswerBlock}>
                <h3>AI 답변</h3>
                {answer ? (
                  <>
                    <ResearchMarkdown answer={answer} evidence={evidence} />
                    {status === "loading" && (
                      <span
                        aria-hidden="true"
                        className={styles.aiStreamingCursor}
                      />
                    )}
                  </>
                ) : (
                  <p className={styles.aiAnswerPlaceholder}>
                    먼저 MCP 도구와 쟁점을 확인하고 있어요. 답변은 준비되는
                    문단부터 바로 표시됩니다.
                  </p>
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

            <details className={styles.aiHarnessDetails}>
              <summary>하네스 확인 흐름</summary>
              <div className={styles.harnessSteps}>
                {plan.steps.map((step) => (
                  <article key={step.id}>
                    <strong>{step.label}</strong>
                    <span>{step.description}</span>
                  </article>
                ))}
              </div>
            </details>
          </article>
        )}

        {!plan && answer && (
          <article className={styles.aiOverviewCard}>
            <section className={styles.aiAnswerBlock}>
              <h3>AI 답변</h3>
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

        {status === "loading" && !answer && phase && (
          <div className={styles.aiStreamingNotice}>
            <span />
            {toolStatus || phaseLabel(phase)}
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
    composing: "답변을 한 번에 쓰지 않고 문단별로 생성하는 중이에요.",
    connecting: "연결된 MCP 검색 도구를 확인하는 중이에요.",
    planning: "LLM이 검색 계획을 세우는 중이에요.",
    retrieving: "검색 결과를 검토하고 다음 도구를 고르는 중이에요.",
    verifying: "인용과 단정 표현을 검증하는 중이에요.",
  };
  return labels[phase] ?? "법률 질문을 처리하는 중이에요.";
}

function phaseTitle(phase: string) {
  const labels: Record<string, string> = {
    composing: "문단별 답변 생성",
    connecting: "MCP 연결 확인",
    planning: "질문 분석",
    retrieving: "추가 근거 탐색",
    verifying: "심층 검증",
  };
  return labels[phase] ?? "처리 상태";
}

function modeLabel(mode: Plan["mode"]) {
  const labels = {
    deep: "심층 모드",
    overview: "오버뷰 모드",
    quick: "빠른 답변",
  } satisfies Record<Plan["mode"], string>;
  return labels[mode];
}

function toolStatusLabel(tool: string, stage: string) {
  if (stage === "calling") {
    return `${tool} 검색 중...`;
  }
  if (stage === "completed") {
    return `${tool} 검색 결과를 확인했어요.`;
  }
  return `${tool} 검색에 실패해 다른 경로를 확인하고 있어요.`;
}
