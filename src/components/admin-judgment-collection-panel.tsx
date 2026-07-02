"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { LocalTime } from "@/components/local-time";
import type { JudgmentCollectionStatus } from "@/lib/judgment-collection";

const collectionStages = [
  "수집 요청 준비",
  "공개 데이터 목록 확인",
  "본문 확인 및 저장",
  "수집 결과 정리",
] as const;

type RunResponse = {
  result: {
    createdCount: number;
    importedCount: number;
    updatedCount: number;
  };
};

export function AdminJudgmentCollectionPanel({
  status,
}: {
  status: JudgmentCollectionStatus;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(
    "판례, 헌재결정례, 현행 법령을 주기적으로 확인하고 새 데이터만 저장해요.",
  );
  const [noticeStatus, setNoticeStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStageIndex, setProgressStageIndex] = useState(0);
  const [runSummary, setRunSummary] = useState<string | null>(null);
  const isBusyRef = useRef(false);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setProgressPercent((current) => Math.min(88, current + 9));
      setProgressStageIndex((current) =>
        Math.min(collectionStages.length - 2, current + 1),
      );
    }, 800);
    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  async function submitRequest(body: unknown) {
    const response = await fetch("/api/admin/judgment-collection", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error("request_failed");
    }
    return response.json() as Promise<unknown>;
  }

  return (
    <div className={styles.contentGrid}>
      <form
        className={`${styles.contentCard} ${styles.settingsForm} ${styles.collectionFormCard}`}
        onSubmit={async (event) => {
          event.preventDefault();
          if (isBusyRef.current) {
            return;
          }
          isBusyRef.current = true;
          setIsSaving(true);
          setNoticeStatus("idle");
          try {
            const formData = new FormData(event.currentTarget);
            await submitRequest({
              action: "save",
              settings: {
                enabled: formData.get("enabled") === "on",
                intervalMinutes: formData.get("intervalMinutes"),
              },
            });
            setNoticeStatus("success");
            setMessage("수집 설정을 저장했어요.");
            router.refresh();
          } catch (_error) {
            setNoticeStatus("error");
            setMessage(
              "설정을 저장하지 못했어요. 입력값과 권한을 확인해 주세요.",
            );
          } finally {
            isBusyRef.current = false;
            setIsSaving(false);
          }
        }}
      >
        <output
          className={
            noticeStatus === "success"
              ? styles.settingsNoticeSuccess
              : noticeStatus === "error"
                ? styles.settingsNoticeError
                : styles.settingsNotice
          }
        >
          {message}
        </output>
        <label className={styles.checkboxField}>
          <input
            defaultChecked={status.enabled}
            name="enabled"
            type="checkbox"
          />
          <span>자동 수집 사용</span>
        </label>
        <div className={styles.collectionScope}>
          <strong>판례·헌재·법령 증분 수집</strong>
          <p>
            검색어 없이 공개 목록을 최신순으로 확인하고, 이미 저장된 데이터가
            나오면 해당 범주의 수집을 멈춥니다.
          </p>
        </div>
        <label className={styles.settingsField} htmlFor="collection-interval">
          <span className={styles.label}>수집 주기(분)</span>
          <input
            className={styles.input}
            defaultValue={status.intervalMinutes}
            id="collection-interval"
            max={10080}
            min={10}
            name="intervalMinutes"
            required
            type="number"
          />
        </label>
        <div className={styles.settingsActions}>
          <button
            className={styles.primaryButton}
            disabled={isSaving || isRunning}
            type="submit"
          >
            {isSaving ? "저장 중" : "설정 저장"}
          </button>
          <button
            className={styles.secondaryButton}
            disabled={isSaving || isRunning}
            onClick={async () => {
              if (isBusyRef.current) {
                return;
              }
              isBusyRef.current = true;
              setIsRunning(true);
              setNoticeStatus("idle");
              setProgressModalOpen(true);
              setProgressPercent(8);
              setProgressStageIndex(0);
              setRunSummary(null);
              setMessage("수집을 시작했어요.");
              try {
                const data = await submitRequest({ action: "run" });
                const summary = isRunResponse(data)
                  ? formatRunSummary(data.result)
                  : "수집 결과를 정리했어요.";
                setProgressPercent(100);
                setProgressStageIndex(collectionStages.length - 1);
                setRunSummary(summary);
                setNoticeStatus("success");
                setMessage(summary);
                router.refresh();
              } catch (_error) {
                setProgressPercent(100);
                setProgressStageIndex(collectionStages.length - 1);
                setRunSummary(
                  "수집을 마치지 못했어요. 잠시 후 다시 시도해 주세요.",
                );
                setNoticeStatus("error");
                setMessage(
                  "수집을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
                );
              } finally {
                isBusyRef.current = false;
                setIsRunning(false);
              }
            }}
            type="button"
          >
            {isRunning ? "실행 중" : "지금 수집"}
          </button>
        </div>
      </form>
      <div className={`${styles.contentCard} ${styles.collectionStatusCard}`}>
        <h3 className={styles.panelTitle}>수집 상태</h3>
        <dl className={styles.securityMeta}>
          <div>
            <dt>상태</dt>
            <dd>{status.status}</dd>
          </div>
          <div>
            <dt>다음 실행</dt>
            <dd>
              <LocalTime dateTime={status.nextRunAt} />
            </dd>
          </div>
          <div>
            <dt>마지막 실행</dt>
            <dd>
              {status.lastRunAt ? (
                <LocalTime dateTime={status.lastRunAt} />
              ) : (
                "-"
              )}
            </dd>
          </div>
          <div>
            <dt>마지막 수집 건수</dt>
            <dd>{status.lastImportedCount.toLocaleString("ko-KR")}</dd>
          </div>
          {status.lastFailureReason && (
            <div>
              <dt>실패 사유</dt>
              <dd>{status.lastFailureReason}</dd>
            </div>
          )}
        </dl>
      </div>
      {progressModalOpen && (
        <div className={styles.modalBackdrop}>
          <div
            aria-labelledby="judgment-collection-progress-title"
            aria-modal="true"
            className={styles.progressModal}
            role="dialog"
          >
            <div className={styles.progressModalHeader}>
              <div className={styles.progressModalTop}>
                <span className={styles.badge}>법률 데이터 수집</span>
                <strong>{Math.round(progressPercent)}%</strong>
              </div>
              <h2 id="judgment-collection-progress-title">
                {isRunning
                  ? "법률 데이터를 수집하고 있어요"
                  : noticeStatus === "error"
                    ? "수집을 마치지 못했어요"
                    : "수집이 끝났어요"}
              </h2>
              <p>
                {runSummary ??
                  "공개 목록을 확인하면서 새 데이터만 저장하고 있어요."}
              </p>
            </div>
            <div className={styles.progressMeta}>
              <span>
                {collectionStages[progressStageIndex] ?? "수집 결과 정리"}
              </span>
              <span>증분 수집</span>
            </div>
            <div
              aria-label={`수집 진행률 ${Math.round(progressPercent)}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(progressPercent)}
              className={styles.progressTrack}
              role="progressbar"
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <ol className={styles.progressSteps}>
              {collectionStages.map((stage, index) => (
                <li
                  className={progressStepClass(index, progressStageIndex)}
                  key={stage}
                >
                  {stage}
                </li>
              ))}
            </ol>
            {isRunning ? (
              <span className={styles.progressHint}>
                창을 닫지 않아도 수집은 계속 진행됩니다.
              </span>
            ) : (
              <div className={styles.authModalActions}>
                <button
                  className={styles.primaryButton}
                  onClick={() => setProgressModalOpen(false)}
                  type="button"
                >
                  닫기
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function isRunResponse(value: unknown): value is RunResponse {
  if (!isRecord(value) || !isRecord(value.result)) {
    return false;
  }
  return (
    typeof value.result.importedCount === "number" &&
    typeof value.result.createdCount === "number" &&
    typeof value.result.updatedCount === "number"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatRunSummary(result: RunResponse["result"]) {
  return `수집 완료: ${result.importedCount.toLocaleString("ko-KR")}건 확인, 신규 ${result.createdCount.toLocaleString("ko-KR")}건 저장, 갱신 ${result.updatedCount.toLocaleString("ko-KR")}건`;
}

function progressStepClass(index: number, currentIndex: number) {
  if (index < currentIndex) {
    return `${styles.progressStep} ${styles.progressStepDone}`;
  }
  if (index === currentIndex) {
    return `${styles.progressStep} ${styles.progressStepCurrent}`;
  }
  return styles.progressStep;
}
