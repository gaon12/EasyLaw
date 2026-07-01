"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/page.module.css";

type Explanation = {
  aiAvailable: boolean;
  aiExplanation: string;
  definitions: {
    definition: string;
    partOfSpeech: string | null;
    senseNo: string;
    source: "legal" | "basic" | "standard";
    word: string;
  }[];
  plain: string;
  priority: string;
  term: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDefinition(
  value: unknown,
): value is Explanation["definitions"][number] {
  return (
    isRecord(value) &&
    typeof value.definition === "string" &&
    (typeof value.partOfSpeech === "string" || value.partOfSpeech === null) &&
    typeof value.senseNo === "string" &&
    (value.source === "legal" ||
      value.source === "basic" ||
      value.source === "standard") &&
    typeof value.word === "string"
  );
}

function isExplanation(value: unknown): value is Explanation {
  return (
    isRecord(value) &&
    typeof value.aiAvailable === "boolean" &&
    typeof value.aiExplanation === "string" &&
    Array.isArray(value.definitions) &&
    value.definitions.every(isDefinition) &&
    typeof value.plain === "string" &&
    typeof value.priority === "string" &&
    typeof value.term === "string"
  );
}

export function TermExplainer() {
  const [term, setTerm] = useState("");
  const [context, setContext] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const ignoreCloseRef = useRef(false);

  useEffect(() => {
    function handlePointerUp() {
      if (ignoreCloseRef.current) {
        ignoreCloseRef.current = false;
        return;
      }
      const selection = window.getSelection();
      const text = selection?.toString().trim().replace(/\s+/g, " ") ?? "";
      const target = selection?.anchorNode?.parentElement;
      if (target?.closest("input, textarea, select, button, a")) {
        return;
      }
      if (!text || text.length < 2 || text.length > 80) {
        return;
      }
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setTerm(text);
      const nextContext = selectionContext(selection);
      setContext(nextContext);
      setPosition({
        left: Math.min(rect.left + window.scrollX, window.innerWidth - 360),
        top: rect.bottom + window.scrollY + 10,
      });
      setExplanation(null);
      setStatus("loading");
      const params = new URLSearchParams({
        context: nextContext,
        term: text,
      });
      void fetch(`/api/terms/explain?${params}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("term lookup failed");
          }
          const data: unknown = await response.json();
          return data;
        })
        .then((data) => {
          if (!isExplanation(data)) {
            throw new Error("invalid term lookup response");
          }
          return data;
        })
        .then((data) => {
          setExplanation(data);
          setStatus("idle");
        })
        .catch(() => {
          setStatus("error");
        });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setTerm("");
      }
    }

    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!term) {
    return null;
  }

  return (
    <aside
      className={styles.termPopover}
      onPointerDown={() => {
        ignoreCloseRef.current = true;
      }}
      style={{ left: position.left, top: position.top }}
    >
      <div>
        <span>용어 설명</span>
        <button onClick={() => setTerm("")} type="button">
          닫기
        </button>
      </div>
      <h2>{term}</h2>
      {status === "loading" && <p>사전과 쉬운 설명을 찾고 있어요.</p>}
      {status === "error" && <p>설명을 불러오지 못했어요.</p>}
      {explanation && (
        <>
          <section>
            <strong>사전 · {explanation.priority}</strong>
            {explanation.definitions.length > 0 ? (
              <ol>
                {explanation.definitions.map((item) => (
                  <li key={`${item.word}-${item.senseNo}-${item.definition}`}>
                    {item.partOfSpeech && <em>{item.partOfSpeech}</em>}
                    <em>{sourceLabel(item.source)}</em>
                    {item.definition}
                  </li>
                ))}
              </ol>
            ) : (
              <p>{explanation.plain}</p>
            )}
          </section>
          <section>
            <strong>AI 쉬운 설명</strong>
            <p>{explanation.aiExplanation}</p>
            {!explanation.aiAvailable && (
              <small>
                MCP 엔드포인트를 연결하면 확장 설명을 붙일 수 있어요.
              </small>
            )}
            <a className={styles.termAiLink} href={researchHref(term, context)}>
              AI 질문으로 이어가기
            </a>
          </section>
        </>
      )}
    </aside>
  );
}

function researchHref(term: string, context: string) {
  const query = context
    ? `"${term}"이 이 문맥에서 무슨 뜻인지 설명해줘: ${context}`
    : `"${term}"의 법률 문맥상 의미를 설명해줘`;
  return `/research?q=${encodeURIComponent(query.slice(0, 500))}`;
}

function selectionContext(selection: Selection | null) {
  const container = selection?.anchorNode?.parentElement;
  return (container?.textContent ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function sourceLabel(source: "legal" | "basic" | "standard") {
  if (source === "legal") {
    return "법률";
  }
  if (source === "basic") {
    return "기초";
  }
  return "표준";
}
