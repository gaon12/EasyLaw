"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/page.module.css";

type UpdateSource = "all" | "basic" | "standard";

const updateStages = [
  "업데이트 요청 준비",
  "사전 ZIP 다운로드",
  "압축 해제 및 JSON 확인",
  "뜻풀이 DB 반영",
  "임시 파일 정리",
] as const;

const updateOptions: { label: string; source: UpdateSource }[] = [
  { label: "전체 업데이트", source: "all" },
  { label: "한국어기초사전 업데이트", source: "basic" },
  { label: "표준국어대사전 업데이트", source: "standard" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDictionaryUpdateResponse(
  value: unknown,
): value is { importedCount: number } {
  return isRecord(value) && typeof value.importedCount === "number";
}

function responseMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.message === "string"
    ? value.message
    : fallback;
}

export function DictionaryUpdateButton() {
  const [message, setMessage] = useState(
    "한국어기초사전과 표준국어대사전 ZIP을 내려받아 JSON만 DB에 반영합니다.",
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [runningSource, setRunningSource] = useState<UpdateSource | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (status !== "loading") {
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((current) => Math.min(current + 7, 88));
      setStageIndex((current) =>
        current < updateStages.length - 2 ? current + 1 : current,
      );
    }, 900);

    return () => window.clearInterval(interval);
  }, [status]);

  async function update(source: UpdateSource) {
    if (isRunningRef.current) {
      return;
    }
    isRunningRef.current = true;
    setRunningSource(source);
    setStatus("loading");
    setModalOpen(true);
    setStageIndex(0);
    setProgress(8);
    setMessage(
      "사전 데이터를 내려받고 있어요. 반영이 끝나면 임시 파일을 삭제합니다.",
    );
    try {
      const response = await fetch("/api/admin/dictionary/update", {
        body: JSON.stringify({ source }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setStatus("error");
        setProgress(100);
        setMessage(responseMessage(data, "사전 업데이트에 실패했어요."));
        return;
      }
      if (!isDictionaryUpdateResponse(data)) {
        setStatus("error");
        setProgress(100);
        setMessage("사전 업데이트 응답 형식을 확인하지 못했어요.");
        return;
      }
      setStageIndex(updateStages.length - 1);
      setProgress(100);
      setStatus("success");
      setMessage(
        `${data.importedCount.toLocaleString("ko-KR")}개의 뜻풀이를 반영했어요.`,
      );
    } catch (_error) {
      setStatus("error");
      setProgress(100);
      setMessage("업데이트 요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      isRunningRef.current = false;
      setRunningSource(null);
    }
  }

  const noticeClass =
    status === "success"
      ? styles.settingsNoticeSuccess
      : status === "error"
        ? styles.settingsNoticeError
        : styles.settingsNotice;

  return (
    <div className={styles.settingsForm}>
      <output className={noticeClass}>{message}</output>
      <div className={styles.settingsActions}>
        {updateOptions.map(({ source, label }) => (
          <button
            className={
              source === "all" ? styles.primaryButton : styles.secondaryButton
            }
            disabled={status === "loading"}
            key={source}
            onClick={() => void update(source)}
            type="button"
          >
            {runningSource === source ? "업데이트 중" : label}
          </button>
        ))}
      </div>

      {modalOpen && (
        <div className={styles.modalBackdrop}>
          <div
            aria-labelledby="dictionary-update-progress-title"
            aria-modal="true"
            className={styles.progressModal}
            role="dialog"
          >
            <div>
              <span className={styles.badge}>사전 업데이트</span>
              <h2 id="dictionary-update-progress-title">
                {status === "loading"
                  ? "공개 사전 데이터를 반영하고 있어요"
                  : status === "success"
                    ? "업데이트가 끝났어요"
                    : "업데이트를 마치지 못했어요"}
              </h2>
              <p>{message}</p>
            </div>

            <div
              aria-label={`진행률 ${Math.round(progress)}%`}
              className={styles.progressTrack}
              role="progressbar"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(progress)}
            >
              <span style={{ width: `${progress}%` }} />
            </div>

            <ol className={styles.progressSteps}>
              {updateStages.map((stage, index) => (
                <li
                  className={
                    index <= stageIndex ? styles.progressStepActive : undefined
                  }
                  key={stage}
                >
                  {stage}
                </li>
              ))}
            </ol>

            <div className={styles.authModalActions}>
              <button
                className={styles.secondaryButton}
                disabled={status === "loading"}
                onClick={() => setModalOpen(false)}
                type="button"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
