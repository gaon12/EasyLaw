"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

export function LegalTermForm() {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [message, setMessage] = useState(
    "서비스 안에서 우선 적용할 법률 용어를 직접 등록합니다.",
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const isSavingRef = useRef(false);

  async function save() {
    if (isSavingRef.current) {
      return;
    }
    isSavingRef.current = true;
    setStatus("loading");
    try {
      const response = await fetch("/api/admin/dictionary/legal-terms", {
        body: JSON.stringify({ definition, word }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setStatus("error");
        setMessage("용어를 저장하지 못했어요. 입력값을 확인해 주세요.");
        return;
      }
      setStatus("success");
      setMessage("자체 법률 용어 사전에 저장했어요.");
      setWord("");
      setDefinition("");
    } catch (_error) {
      setStatus("error");
      setMessage("저장 요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      isSavingRef.current = false;
    }
  }

  return (
    <form
      className={styles.settingsForm}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
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
          disabled={status === "loading" || !word.trim() || !definition.trim()}
          type="submit"
        >
          {status === "loading" ? "저장 중" : "법률 용어 저장"}
        </button>
      </div>
    </form>
  );
}
