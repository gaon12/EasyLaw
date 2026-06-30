"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/app/page.module.css";

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
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    initialQuery ? "loading" : "idle",
  );

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
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal,
        });

        if (!response.ok || !response.body) {
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
    <div className={styles.researchLayout}>
      <section className={styles.workspace}>
        <h1>AI 법률 질문</h1>
        <p>
          상황을 자연어로 적으면 리서치 하네스가 확인 범위, 근거 후보, 쉬운 답변
          초안을 순서대로 구성해요.
        </p>
        <form
          className={styles.authForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim()) {
              setActiveQuery(query.trim());
            }
          }}
        >
          <label className={styles.label} htmlFor="research-query">
            질문
          </label>
          <textarea
            className={styles.textarea}
            id="research-query"
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

      <section className={styles.researchResult} aria-live="polite">
        {status === "idle" && (
          <div className={styles.notice}>
            질문을 입력하면 Skeleton 상태에서 근거 후보와 답변 초안이 차례대로
            나타납니다.
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
          <div className={styles.contentCard}>
            <span className={styles.badge}>Level {plan.coverageLevel}</span>
            <h2>{plan.coverageLabel}</h2>
            <p>{plan.intent}</p>
            <p>모델: {plan.modelLabel}</p>
            <div className={styles.harnessSteps}>
              {plan.steps.map((step) => (
                <article key={step.id}>
                  <strong>{step.label}</strong>
                  <span>{step.description}</span>
                </article>
              ))}
            </div>
          </div>
        )}

        {evidence.length > 0 && (
          <div className={styles.contentCard}>
            <h2>근거 후보</h2>
            <div className={styles.evidenceList}>
              {evidence.map((item) => (
                <article key={`${item.source}-${item.title}`}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.source} · 신뢰도 {item.confidence}
                  </span>
                  <p>{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {answer && (
          <article className={styles.researchAnswer}>
            <h2>답변 초안</h2>
            <p>{answer}</p>
          </article>
        )}

        {status === "error" && (
          <p className={styles.notice}>
            질문을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.
          </p>
        )}
      </section>
    </div>
  );
}
