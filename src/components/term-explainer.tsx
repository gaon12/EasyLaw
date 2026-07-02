"use client";

import { usePathname } from "next/navigation";
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

const termExplainerRoutes = ["/p/", "/cp/", "/guide", "/research"];

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
  const pathname = usePathname();
  const enabled = termExplainerRoutes.some((route) =>
    route.endsWith("/")
      ? (pathname ?? "").startsWith(route)
      : pathname === route,
  );
  const [term, setTerm] = useState("");
  const [context, setContext] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const ignoreCloseRef = useRef(false);
  const popoverRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTerm("");
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (popoverRef.current?.contains(target)) {
        ignoreCloseRef.current = true;
        return;
      }
      if (term) {
        setTerm("");
      }
    }

    function handlePointerUp(event: PointerEvent) {
      if (ignoreCloseRef.current) {
        ignoreCloseRef.current = false;
        return;
      }

      const pointerTarget = event.target;
      if (
        pointerTarget instanceof Element &&
        shouldIgnoreTermSelection(pointerTarget)
      ) {
        return;
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim().replace(/\s+/g, " ") ?? "";
      const target = selectedElement(selection);
      if (target && shouldIgnoreTermSelection(target)) {
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

      const nextContext = selectionContext(selection);
      setTerm(text);
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
          return (await response.json()) as unknown;
        })
        .then((data) => {
          if (!isExplanation(data)) {
            throw new Error("invalid term lookup response");
          }
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

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, term]);

  if (!enabled || !term) {
    return null;
  }

  return (
    <aside
      className={styles.termPopover}
      onPointerDown={() => {
        ignoreCloseRef.current = true;
      }}
      ref={popoverRef}
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
        <section>
          <strong>
            {explanation.definitions.length > 0
              ? `쉬운 설명 · ${explanation.priority}`
              : "사전 미등록"}
          </strong>
          <p>{explanation.aiExplanation}</p>
          {explanation.definitions.length > 0 ? (
            <>
              <small>사전 원문</small>
              <ol>
                {explanation.definitions.map((item) => (
                  <li key={`${item.word}-${item.senseNo}-${item.definition}`}>
                    {item.partOfSpeech && <em>{item.partOfSpeech}</em>}
                    <em>{sourceLabel(item.source)}</em>
                    {item.definition}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className={styles.termMissing}>{explanation.plain}</p>
          )}
          {!explanation.aiAvailable && (
            <small>
              사전과 현재 문맥을 바탕으로 간단히 안내합니다. 더 넓게 보려면 AI
              질문으로 이어가세요.
            </small>
          )}
          <a className={styles.termAiLink} href={researchHref(term, context)}>
            AI 질문으로 이어가기
          </a>
        </section>
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
  const container = selectedElement(selection);
  return (container?.textContent ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function selectedElement(selection: Selection | null) {
  const node = selection?.anchorNode;
  if (!node) {
    return null;
  }
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function shouldIgnoreTermSelection(target: Element) {
  return Boolean(
    target.closest(
      [
        "[data-term-explainer-ignore]",
        "input",
        "textarea",
        "select",
        "button",
        "a",
        "[role='button']",
        "[role='menu']",
        "[role='dialog']",
      ].join(", "),
    ),
  );
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
