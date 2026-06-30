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
    word: string;
  }[];
  plain: string;
  term: string;
};

export function TermExplainer() {
  const [term, setTerm] = useState("");
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
      if (!text || text.length < 2 || text.length > 30) {
        return;
      }
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setTerm(text);
      setPosition({
        left: Math.min(rect.left + window.scrollX, window.innerWidth - 360),
        top: rect.bottom + window.scrollY + 10,
      });
      setExplanation(null);
      setStatus("loading");
      void fetch(`/api/terms/explain?term=${encodeURIComponent(text)}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error("term lookup failed");
          }
          return response.json() as Promise<Explanation>;
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
            <strong>사전</strong>
            {explanation.definitions.length > 0 ? (
              <ol>
                {explanation.definitions.map((item) => (
                  <li key={`${item.word}-${item.senseNo}-${item.definition}`}>
                    {item.partOfSpeech && <em>{item.partOfSpeech}</em>}
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
          </section>
        </>
      )}
    </aside>
  );
}
