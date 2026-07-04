"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/page.module.css";

type UpdateSource = "all" | "basic" | "standard" | "legal";
type ProgressStage =
  | "preparing"
  | "downloading"
  | "scanning"
  | "saving"
  | "finalizing"
  | "done";

type DictionaryProgress = {
  current: number;
  failureReason: string | null;
  importedCount: number;
  message: string;
  percent: number;
  source: Exclude<UpdateSource, "all">;
  stage: ProgressStage;
  status: string;
  total: number;
};

type ProgressResponse = {
  progress: DictionaryProgress | null;
};

const updateStages = [
  "업데이트 요청 준비",
  "사전 데이터 가져오기",
  "자료 목록 확인",
  "뜻풀이 저장",
  "마무리",
] as const;

const updateOptions: { label: string; source: UpdateSource }[] = [
  { label: "전체 업데이트", source: "all" },
  { label: "한국어기초사전 업데이트", source: "basic" },
  { label: "표준국어대사전 업데이트", source: "standard" },
  { label: "법령용어 업데이트", source: "legal" },
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
    "한국어기초사전과 표준국어대사전의 최신 뜻풀이를 로컬 사전에 반영합니다.",
  );
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "empty" | "error"
  >("idle");
  const [runningSource, setRunningSource] = useState<UpdateSource | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressDetail, setProgressDetail] = useState("준비 중");
  const hasSeenRunningProgressRef = useRef(false);
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (status !== "loading") {
      return;
    }

    let isMounted = true;

    async function pollProgress() {
      try {
        const nextProgress = await fetchDictionaryProgress(
          runningSource ?? "all",
        );
        if (!isMounted || !nextProgress) {
          return;
        }
        setProgress(nextProgress.percent);
        setStageIndex(progressStageIndex(nextProgress.stage));
        setProgressDetail(formatProgressDetail(nextProgress));
        if (nextProgress.message) {
          setMessage(nextProgress.message);
        }
        if (nextProgress.status === "running") {
          hasSeenRunningProgressRef.current = true;
        }
        if (
          hasSeenRunningProgressRef.current &&
          (nextProgress.status === "completed" ||
            nextProgress.status === "failed")
        ) {
          const succeeded = nextProgress.status === "completed";
          setProgress(100);
          setStageIndex(updateStages.length - 1);
          setStatus(
            succeeded
              ? nextProgress.importedCount > 0
                ? "success"
                : "empty"
              : "error",
          );
          setMessage(
            succeeded
              ? formatRunSummary(nextProgress)
              : nextProgress.failureReason ||
                  "사전 업데이트에 실패했어요. 최근 작업 기록을 확인해 주세요.",
          );
          setRunningSource(null);
          isRunningRef.current = false;
        }
      } catch (_error) {
        if (isMounted) {
          setProgressDetail("진행 상태를 다시 확인하고 있어요.");
        }
      }
    }

    void pollProgress();
    const intervalId = window.setInterval(() => void pollProgress(), 800);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [runningSource, status]);

  async function update(source: UpdateSource) {
    if (isRunningRef.current) {
      return;
    }
    isRunningRef.current = true;
    setRunningSource(source);
    setStatus("loading");
    setModalOpen(true);
    setStageIndex(0);
    setProgress(0);
    setProgressDetail("준비 중");
    hasSeenRunningProgressRef.current = false;
    setMessage(
      "사전 데이터를 가져오고 있어요. 완료되면 검색과 용어 설명에 바로 반영됩니다.",
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
      if (data.importedCount > 0) {
        setStatus("success");
        setMessage(
          `${data.importedCount.toLocaleString("ko-KR")}개의 뜻풀이를 반영했어요.`,
        );
      } else {
        setStatus("empty");
        setMessage(
          "가져오기는 끝났지만 새로 반영된 뜻풀이가 없어요. 최근 작업 기록에서 원본 데이터 상태를 확인해 주세요.",
        );
      }
    } catch (_error) {
      setStatus("error");
      setProgress(100);
      setMessage("업데이트 요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      isRunningRef.current = false;
      setRunningSource(null);
    }
  }

  function progressStepClass(index: number) {
    if (status === "loading" && index === stageIndex) {
      return `${styles.progressStep} ${styles.progressStepCurrent}`;
    }
    if (index < stageIndex || (status !== "loading" && index <= stageIndex)) {
      return `${styles.progressStep} ${styles.progressStepDone}`;
    }
    return styles.progressStep;
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
              source === "all" || source === "legal"
                ? styles.primaryButton
                : styles.secondaryButton
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
            <div className={styles.progressModalHeader}>
              <div className={styles.progressModalTop}>
                <span className={styles.badge}>사전 업데이트</span>
                <strong>{Math.round(progress)}%</strong>
              </div>
              <h2 id="dictionary-update-progress-title">
                {status === "loading"
                  ? "공개 사전 데이터를 반영하고 있어요"
                  : status === "success"
                    ? "업데이트가 끝났어요"
                    : status === "empty"
                      ? "반영된 뜻풀이가 없어요"
                      : "업데이트를 마치지 못했어요"}
              </h2>
              <p>{message}</p>
            </div>

            <div className={styles.progressMeta}>
              <span>{updateStages[stageIndex]}</span>
              <span>{progressDetail}</span>
            </div>

            <div
              aria-label={`진행률 ${Math.round(progress)}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(progress)}
              className={styles.progressTrack}
              role="progressbar"
            >
              <span style={{ width: `${progress}%` }} />
            </div>

            <ol className={styles.progressSteps}>
              {updateStages.map((stage, index) => (
                <li className={progressStepClass(index)} key={stage}>
                  {stage}
                </li>
              ))}
            </ol>

            <div className={styles.authModalActions}>
              {status === "loading" ? (
                <span className={styles.progressHint}>
                  반영이 끝날 때까지 기다려 주세요.
                </span>
              ) : (
                <button
                  className={styles.secondaryButton}
                  onClick={() => setModalOpen(false)}
                  type="button"
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function runningSourceLabel(source: UpdateSource | null) {
  if (source === "basic") {
    return "한국어기초사전";
  }
  if (source === "standard") {
    return "표준국어대사전";
  }
  if (source === "legal") {
    return "법령용어";
  }
  return "전체";
}

async function fetchDictionaryProgress(source: UpdateSource) {
  const params = new URLSearchParams({ source });
  const response = await fetch(`/api/admin/dictionary/update?${params}`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error("progress_failed");
  }
  const data = (await response.json()) as unknown;
  return isProgressResponse(data) ? data.progress : null;
}

function isProgressResponse(value: unknown): value is ProgressResponse {
  if (!isRecord(value) || !("progress" in value)) {
    return false;
  }
  if (value.progress === null) {
    return true;
  }
  return (
    isRecord(value.progress) &&
    typeof value.progress.current === "number" &&
    (typeof value.progress.failureReason === "string" ||
      value.progress.failureReason === null) &&
    typeof value.progress.importedCount === "number" &&
    typeof value.progress.message === "string" &&
    typeof value.progress.percent === "number" &&
    isUpdateSource(value.progress.source) &&
    isProgressStage(value.progress.stage) &&
    typeof value.progress.status === "string" &&
    typeof value.progress.total === "number"
  );
}

function isUpdateSource(value: unknown): value is Exclude<UpdateSource, "all"> {
  return value === "basic" || value === "standard" || value === "legal";
}

function isProgressStage(value: unknown): value is ProgressStage {
  return (
    value === "preparing" ||
    value === "downloading" ||
    value === "scanning" ||
    value === "saving" ||
    value === "finalizing" ||
    value === "done"
  );
}

function progressStageIndex(stage: ProgressStage) {
  if (stage === "downloading") {
    return 1;
  }
  if (stage === "scanning") {
    return 2;
  }
  if (stage === "saving") {
    return 3;
  }
  if (stage === "finalizing" || stage === "done") {
    return 4;
  }
  return 0;
}

function formatProgressDetail(progress: DictionaryProgress) {
  const source = runningSourceLabel(progress.source);
  if (progress.stage === "downloading" || progress.stage === "saving") {
    return `${source} · ${progress.current.toLocaleString("ko-KR")}/${progress.total.toLocaleString("ko-KR")}`;
  }
  return source;
}

function formatRunSummary(progress: DictionaryProgress) {
  if (progress.importedCount === 0) {
    return "가져오기는 끝났지만 새로 반영된 뜻풀이가 없어요. 최근 작업 기록에서 원본 데이터 상태를 확인해 주세요.";
  }
  return `${progress.importedCount.toLocaleString("ko-KR")}개의 뜻풀이를 반영했어요.`;
}
