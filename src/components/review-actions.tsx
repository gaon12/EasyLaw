"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

export function ReviewActions({
  jobId,
  mode,
}: {
  jobId: string;
  mode: "review" | "failed";
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const busyRef = useRef(false);

  async function run(body: Record<string, string>, doneMessage: string) {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setState("busy");
    try {
      const response = await fetch(`/api/admin/reviews/${jobId}`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setMessage(data?.message ?? "요청을 처리하지 못했어요.");
        setState("error");
        return;
      }
      setMessage(doneMessage);
      setState("done");
      window.location.reload();
    } catch {
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
      setState("error");
    } finally {
      busyRef.current = false;
    }
  }

  if (state === "done") {
    return <output className={styles.settingsNoticeSuccess}>{message}</output>;
  }

  return (
    <div className={styles.reviewActions}>
      {mode === "review" ? (
        <>
          <button
            className={styles.primaryButton}
            disabled={state === "busy"}
            onClick={() =>
              void run({ action: "approve" }, "승인하고 알림을 발송했어요.")
            }
            type="button"
          >
            승인하기
          </button>
          {rejecting ? (
            <span className={styles.reviewRejectRow}>
              <input
                aria-label="반려 사유"
                className={styles.input}
                maxLength={300}
                onChange={(event) => setReason(event.target.value)}
                placeholder="반려 사유를 입력하세요"
                value={reason}
              />
              <button
                className={styles.dangerButton}
                disabled={state === "busy" || reason.trim().length === 0}
                onClick={() =>
                  void run(
                    { action: "reject", reason: reason.trim() },
                    "반려했어요. 문서는 재생성 대기 상태로 돌아갑니다.",
                  )
                }
                type="button"
              >
                반려 확정
              </button>
            </span>
          ) : (
            <button
              className={styles.secondaryButton}
              disabled={state === "busy"}
              onClick={() => setRejecting(true)}
              type="button"
            >
              반려하기
            </button>
          )}
        </>
      ) : (
        <button
          className={styles.secondaryButton}
          disabled={state === "busy"}
          onClick={() =>
            void run({ action: "requeue" }, "다시 생성 대기열에 넣었어요.")
          }
          type="button"
        >
          다시 생성하기
        </button>
      )}
      {state === "error" && (
        <output className={styles.settingsNoticeError}>{message}</output>
      )}
    </div>
  );
}
