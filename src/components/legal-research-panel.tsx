"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { clientFingerprintHeaders } from "@/lib/client-fingerprint";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";

type ResearchStep = {
  id: string;
  label: string;
  description: string;
};

type Evidence = {
  source: string;
  title: string;
  summary: string;
  confidence: "high" | "medium" | "low";
};

type Plan = {
  coverageLabel: string;
  coverageLevel: number;
  intent: string;
  modelLabel: string;
  steps: ResearchStep[];
};

export function LegalResearchPanel({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [answer, setAnswer] = useState("");
  const [errorMessage, setErrorMessage] = useState(
    "질문을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  );
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    initialQuery ? "loading" : "idle",
  );
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
      setEvidence((current) => [...current, data as Evidence]);
    }
    if (event === "token") {
      setAnswer((current) => `${current}${data as string}`);
    }
  }, []);

  const runResearch = useCallback(
    async (nextQuery: string, signal: AbortSignal) => {
      setStatus("loading");
      setPlan(null);
      setEvidence([]);
      setAnswer("");

      try {
        const response = await fetch("/api/research/stream", {
          body: JSON.stringify({ query: nextQuery }),
          headers: {
            "Content-Type": "application/json",
            ...clientFingerprintHeaders(),
          },
          method: "POST",
          signal,
        });

        if (!response.ok || !response.body) {
          if (response.status === 429 || response.status === 401) {
            const data = await response.json().catch(() => null);
            setErrorMessage(
              data?.message ??
                "비회원 이용 한도를 넘었어요. 잠시 후 다시 시도하거나 로그인해 주세요.",
            );
          } else if (response.status === 400) {
            setErrorMessage(
              `질문은 ${LEGAL_RESEARCH_QUERY_MAX_LENGTH.toLocaleString("ko-KR")}자 이내로 입력해 주세요.`,
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
        setStatus("done");
      } catch (_error) {
        if (!signal.aborted) {
          setStatus("error");
        }
      }
    },
    [applyServerEvent],
  );

  useEffect(() => {
    if (!activeQuery) {
      return;
    }

    const abortController = new AbortController();
    void runResearch(activeQuery, abortController.signal);
    return () => abortController.abort();
  }, [activeQuery, runResearch]);

  const skeletonRows = useMemo(
    () => Array.from({ length: 4 }, (_, index) => index),
    [],
  );

  return (
    <div className={styles.researchShell}>
      <section className={styles.researchSearchPanel}>
        <span className={styles.previewLabel}>EasyLaw AI</span>
        <h1>AI 법률 질문</h1>
        <p>궁금한 상황을 검색하듯 입력하면 답변과 근거 후보를 함께 보여줘요.</p>
        <form
          className={styles.researchSearchForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (submitGuardRef.current || status === "loading") {
              return;
            }
            if (query.trim()) {
              submitGuardRef.current = true;
              setActiveQuery(query.trim());
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
            <span>
              확인 범위, 근거 후보, 쉬운 답변 초안이 순서대로 나타나요.
            </span>
          </div>
        )}

        {status === "loading" && !answer && (
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
              <span className={styles.aiLevel}>Level {plan.coverageLevel}</span>
            </header>
            <div className={styles.aiOverviewMeta}>
              <span>{plan.intent}</span>
              <span>모델 {plan.modelLabel}</span>
            </div>

            {answer && (
              <section className={styles.aiAnswerBlock}>
                <h3>답변 초안</h3>
                <p>{answer}</p>
              </section>
            )}

            {evidence.length > 0 && (
              <section className={styles.aiSources}>
                <h3>근거 후보</h3>
                <div>
                  {evidence.map((item, index) => (
                    <article key={`${item.source}-${item.title}`}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{item.title}</strong>
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
              <h3>답변 초안</h3>
              <p>{answer}</p>
            </section>
          </article>
        )}

        {status === "loading" && answer && (
          <div className={styles.aiStreamingNotice}>
            <span />
            답변을 이어 쓰는 중이에요.
          </div>
        )}

        {status === "error" && <p className={styles.notice}>{errorMessage}</p>}
      </section>
    </div>
  );
}
