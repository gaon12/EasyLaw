"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { LocalTime } from "@/components/local-time";
import type { JudgmentCollectionStatus } from "@/lib/judgment-collection";

export function AdminJudgmentCollectionPanel({
  status,
}: {
  status: JudgmentCollectionStatus;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(
    "수집 설정을 저장하거나 지금 실행할 수 있어요.",
  );
  const [noticeStatus, setNoticeStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const isBusyRef = useRef(false);

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
        className={styles.contentCard}
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
                display: formData.get("display"),
                enabled: formData.get("enabled") === "on",
                intervalMinutes: formData.get("intervalMinutes"),
                query: formData.get("query"),
              },
            });
            setNoticeStatus("success");
            setMessage("판결문 수집 설정을 저장했어요.");
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
        <label className={styles.settingsField} htmlFor="collection-query">
          <span className={styles.label}>검색어</span>
          <input
            className={styles.input}
            defaultValue={status.query}
            id="collection-query"
            maxLength={100}
            name="query"
            required
            type="text"
          />
        </label>
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
        <label className={styles.settingsField} htmlFor="collection-display">
          <span className={styles.label}>한 번에 가져올 건수</span>
          <input
            className={styles.input}
            defaultValue={status.display}
            id="collection-display"
            max={100}
            min={1}
            name="display"
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
              try {
                await submitRequest({ action: "run" });
                setNoticeStatus("success");
                setMessage("판결문 수집을 실행했어요.");
                router.refresh();
              } catch (_error) {
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
      <div className={styles.contentCard}>
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
    </div>
  );
}
