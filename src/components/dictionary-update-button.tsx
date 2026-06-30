"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

type UpdateSource = "all" | "basic" | "standard";

export function DictionaryUpdateButton() {
  const [message, setMessage] = useState(
    "한국어기초사전과 표준국어대사전 ZIP을 내려받아 JSON을 DB에 반영합니다.",
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [runningSource, setRunningSource] = useState<UpdateSource | null>(null);
  const isRunningRef = useRef(false);

  async function update(source: UpdateSource) {
    if (isRunningRef.current) {
      return;
    }
    isRunningRef.current = true;
    setRunningSource(source);
    setStatus("loading");
    setMessage("사전 데이터를 내려받고 있어요. 파일은 반영 후 삭제됩니다.");
    try {
      const response = await fetch("/api/admin/dictionary/update", {
        body: JSON.stringify({ source }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus("error");
        setMessage(data.message ?? "사전 업데이트에 실패했어요.");
        return;
      }
      setStatus("success");
      setMessage(
        `${data.importedCount.toLocaleString("ko-KR")}개 뜻풀이를 반영했어요.`,
      );
    } catch (_error) {
      setStatus("error");
      setMessage("업데이트 요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      isRunningRef.current = false;
      setRunningSource(null);
    }
  }

  return (
    <div className={styles.settingsActions}>
      {[
        ["all", "전체 업데이트"],
        ["basic", "한국어기초사전 업데이트"],
        ["standard", "표준국어대사전 업데이트"],
      ].map(([source, label]) => (
        <button
          className={
            source === "all" ? styles.primaryButton : styles.secondaryButton
          }
          disabled={status === "loading"}
          key={source}
          onClick={() => void update(source as UpdateSource)}
          type="button"
        >
          {runningSource === source ? "업데이트 중" : label}
        </button>
      ))}
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
    </div>
  );
}
