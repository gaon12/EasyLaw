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

type ProgressStage = "preparing" | "listing" | "saving" | "finalizing" | "done";

type CollectionProgress = {
  createdCount: number;
  current: number;
  importedCount: number;
  message: string;
  percent: number;
  stage: ProgressStage;
  status: string;
  total: number;
  updatedCount: number;
};

type ProgressResponse = {
  progress: CollectionProgress | null;
};

export function AdminJudgmentCollectionPanel({
  status,
}: {
  status: JudgmentCollectionStatus;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(
    "판례, 헌재결정례, 법령, 행정규칙, 자치법규를 주기적으로 확인하고 새 데이터만 저장해요.",
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
  const [progressDetail, setProgressDetail] = useState("준비 중");
  const isBusyRef = useRef(false);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    let isMounted = true;
    // 수집은 백그라운드에서 진행되므로 완료 여부도 진행 폴링으로 판단한다.
    async function pollProgress() {
      try {
        const progress = await fetchCollectionProgress();
        if (!isMounted || !progress) {
          return;
        }
        setProgressPercent(progress.percent);
        setProgressStageIndex(stageIndex(progress.stage));
        setProgressDetail(formatProgressDetail(progress));
        setRunSummary(progress.message || null);

        if (progress.status === "success" || progress.status === "failed") {
          const succeeded = progress.status === "success";
          setProgressPercent(100);
          setProgressStageIndex(collectionStages.length - 1);
          setProgressDetail(succeeded ? "완료" : "실패");
          const summary = succeeded
            ? formatRunSummary(progress)
            : progress.message ||
              "수집을 마치지 못했어요. 잠시 후 다시 시도해 주세요.";
          setRunSummary(summary);
          setNoticeStatus(succeeded ? "success" : "error");
          setMessage(summary);
          setIsRunning(false);
          isBusyRef.current = false;
          router.refresh();
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
  }, [isRunning, router]);

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
          <strong>판례·헌재·법령·행정규칙·자치법규 증분 수집</strong>
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
            className={styles.infoButton}
            disabled={isSaving || isRunning}
            onClick={async () => {
              if (isBusyRef.current) {
                return;
              }
              isBusyRef.current = true;
              setIsRunning(true);
              setNoticeStatus("idle");
              setProgressModalOpen(true);
              setProgressPercent(2);
              setProgressStageIndex(0);
              setRunSummary(null);
              setProgressDetail("준비 중");
              setMessage(
                "수집을 시작했어요. 전체 수집은 오래 걸릴 수 있고, 창을 닫아도 서버에서 계속 진행됩니다.",
              );
              try {
                // 202로 즉시 응답한다. 이후 진행·완료는 폴링 effect가 처리한다.
                const response = await fetch("/api/admin/judgment-collection", {
                  body: JSON.stringify({ action: "run" }),
                  headers: { "Content-Type": "application/json" },
                  method: "POST",
                });
                if (response.status === 409) {
                  // 이미 실행 중이면 그 진행 상황을 그대로 보여준다.
                  setMessage("이미 수집이 진행 중이라 현재 진행을 표시해요.");
                  return;
                }
                if (!response.ok) {
                  throw new Error("request_failed");
                }
              } catch (_error) {
                setProgressPercent(100);
                setProgressStageIndex(collectionStages.length - 1);
                setProgressDetail("실패");
                setRunSummary(
                  "수집을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
                );
                setNoticeStatus("error");
                setMessage(
                  "수집을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
                );
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
              <span>{progressDetail}</span>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchCollectionProgress() {
  const response = await fetch("/api/admin/judgment-collection", {
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
    typeof value.progress.createdCount === "number" &&
    typeof value.progress.current === "number" &&
    typeof value.progress.importedCount === "number" &&
    typeof value.progress.message === "string" &&
    typeof value.progress.percent === "number" &&
    isProgressStage(value.progress.stage) &&
    typeof value.progress.status === "string" &&
    typeof value.progress.total === "number" &&
    typeof value.progress.updatedCount === "number"
  );
}

function isProgressStage(value: unknown): value is ProgressStage {
  return (
    value === "preparing" ||
    value === "listing" ||
    value === "saving" ||
    value === "finalizing" ||
    value === "done"
  );
}

function formatRunSummary(progress: CollectionProgress) {
  return `수집 완료: ${progress.importedCount.toLocaleString("ko-KR")}건 확인, 신규 ${progress.createdCount.toLocaleString("ko-KR")}건 저장, 갱신 ${progress.updatedCount.toLocaleString("ko-KR")}건`;
}

function stageIndex(stage: ProgressStage) {
  if (stage === "listing") {
    return 1;
  }
  if (stage === "saving") {
    return 2;
  }
  if (stage === "finalizing" || stage === "done") {
    return 3;
  }
  return 0;
}

function formatProgressDetail(
  progress: NonNullable<ProgressResponse["progress"]>,
) {
  if (progress.stage === "saving") {
    return `${progress.current.toLocaleString("ko-KR")}/${progress.total.toLocaleString("ko-KR")}건`;
  }
  if (progress.stage === "listing") {
    return `${progress.current.toLocaleString("ko-KR")}/${progress.total.toLocaleString("ko-KR")}범주`;
  }
  return progress.status === "running" ? "진행 중" : "완료";
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
