"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { LocalTime } from "@/components/local-time";
import type { LegalDictionaryTermRow } from "@/lib/dictionary";

type LegalTermResponse = {
  terms: LegalDictionaryTermRow[];
};

type LegalTermSaveResponse = LegalTermResponse & {
  importedCount: number;
  ok: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLegalTerm(value: unknown): value is LegalDictionaryTermRow {
  return (
    isRecord(value) &&
    typeof value.definition === "string" &&
    typeof value.id === "string" &&
    (typeof value.origin === "string" || value.origin === null) &&
    (typeof value.partOfSpeech === "string" || value.partOfSpeech === null) &&
    typeof value.senseNo === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.word === "string"
  );
}

function isLegalTermResponse(value: unknown): value is LegalTermResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.terms) &&
    value.terms.every(isLegalTerm)
  );
}

function isLegalTermSaveResponse(
  value: unknown,
): value is LegalTermSaveResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.terms) &&
    value.terms.every(isLegalTerm) &&
    value.ok === true &&
    typeof value.importedCount === "number"
  );
}

export function LegalTermManager({
  initialTerms,
}: {
  initialTerms: LegalDictionaryTermRow[];
}) {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [query, setQuery] = useState("");
  const [terms, setTerms] = useState(initialTerms);
  const [message, setMessage] = useState(
    "서비스 안에서 우선 적용할 법률 용어 설명을 직접 등록합니다.",
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const isBusyRef = useRef(false);

  async function loadTerms(nextQuery = query) {
    if (isBusyRef.current) {
      return;
    }
    isBusyRef.current = true;
    setStatus("loading");
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) {
        params.set("q", nextQuery.trim());
      }
      const response = await fetch(
        `/api/admin/dictionary/legal-terms?${params}`,
      );
      const data: unknown = await response.json();
      if (!response.ok || !isLegalTermResponse(data)) {
        throw new Error("invalid legal term list response");
      }
      setTerms(data.terms);
      setStatus("idle");
      setMessage(
        nextQuery.trim()
          ? `${data.terms.length.toLocaleString("ko-KR")}개의 용어를 찾았어요.`
          : "최근 등록한 자체 법률 용어를 보여주고 있어요.",
      );
    } catch (_error) {
      setStatus("error");
      setMessage("용어 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      isBusyRef.current = false;
    }
  }

  async function save() {
    if (isBusyRef.current) {
      return;
    }
    isBusyRef.current = true;
    setStatus("loading");
    try {
      const response = await fetch("/api/admin/dictionary/legal-terms", {
        body: JSON.stringify({ definition, word }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data: unknown = await response.json();
      if (!response.ok || !isLegalTermSaveResponse(data)) {
        throw new Error("invalid legal term save response");
      }
      setTerms(data.terms);
      setStatus("success");
      setMessage("자체 법률 용어 사전에 저장했어요.");
      setWord("");
      setDefinition("");
      setQuery("");
    } catch (_error) {
      setStatus("error");
      setMessage("용어를 저장하지 못했어요. 입력값을 확인해 주세요.");
    } finally {
      isBusyRef.current = false;
    }
  }

  return (
    <div className={styles.settingsForm}>
      <output
        className={
          status === "success"
            ? styles.settingsNoticeSuccess
            : status === "error"
              ? styles.settingsNoticeError
              : styles.settingsNotice
        }
      >
        {message}
      </output>

      <form
        className={styles.settingsForm}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className={styles.settingsField} htmlFor="legal-term-word">
          <span className={styles.label}>용어</span>
          <input
            className={styles.input}
            id="legal-term-word"
            maxLength={80}
            onChange={(event) => setWord(event.target.value)}
            placeholder="예: 기판력"
            value={word}
          />
        </label>
        <label className={styles.settingsField} htmlFor="legal-term-definition">
          <span className={styles.label}>쉬운 설명</span>
          <textarea
            className={styles.textarea}
            id="legal-term-definition"
            maxLength={1000}
            onChange={(event) => setDefinition(event.target.value)}
            placeholder="서비스에서 먼저 보여줄 쉬운 설명"
            value={definition}
          />
        </label>
        <div className={styles.settingsActions}>
          <button
            className={styles.primaryButton}
            disabled={
              status === "loading" || !word.trim() || !definition.trim()
            }
            type="submit"
          >
            {status === "loading" ? "저장 중" : "법률 용어 저장"}
          </button>
        </div>
      </form>

      <form
        className={styles.dictionarySearch}
        onSubmit={(event) => {
          event.preventDefault();
          void loadTerms(query);
        }}
      >
        <label className={styles.settingsField} htmlFor="legal-term-search">
          <span className={styles.label}>등록 용어 검색</span>
          <input
            className={styles.input}
            id="legal-term-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="용어 또는 설명으로 검색"
            value={query}
          />
        </label>
        <button
          className={styles.secondaryButton}
          disabled={status === "loading"}
          type="submit"
        >
          검색
        </button>
        <button
          className={styles.secondaryButton}
          disabled={status === "loading"}
          onClick={() => {
            setQuery("");
            void loadTerms("");
          }}
          type="button"
        >
          전체 보기
        </button>
      </form>

      <div className={styles.termList} aria-live="polite">
        {terms.length > 0 ? (
          terms.map((term) => (
            <article className={styles.termItem} key={term.id}>
              <div className={styles.termItemHeader}>
                <strong>{term.word}</strong>
                <span>
                  <LocalTime dateTime={term.updatedAt} />
                </span>
              </div>
              <p>{term.definition}</p>
              {term.partOfSpeech && <small>{term.partOfSpeech}</small>}
            </article>
          ))
        ) : (
          <p className={styles.emptyState}>
            아직 등록한 자체 법률 용어가 없어요.
          </p>
        )}
      </div>
    </div>
  );
}
