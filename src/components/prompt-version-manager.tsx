"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

type PromptVersion = {
  version: string;
  description: string;
  isActive: boolean;
  createdAt: string;
};

export function PromptVersionManager({
  versions,
}: {
  versions: PromptVersion[];
}) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [newVersion, setNewVersion] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const busyRef = useRef(false);

  async function request(body: Record<string, string>, doneMessage: string) {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      const response = await fetch("/api/admin/prompt-versions", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setStatus("error");
        setMessage(data?.message ?? "요청을 처리하지 못했어요.");
        return;
      }
      setStatus("success");
      setMessage(doneMessage);
      window.location.reload();
    } catch {
      setStatus("error");
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <div className={styles.promptVersionManager}>
      {message && (
        <output
          className={
            status === "error"
              ? styles.settingsNoticeError
              : styles.settingsNoticeSuccess
          }
        >
          {message}
        </output>
      )}
      <ul className={styles.promptVersionList}>
        {versions.map((version) => (
          <li key={version.version}>
            <div>
              <strong>{version.version}</strong>
              <p>{version.description}</p>
            </div>
            {version.isActive ? (
              <span className={styles.badge}>사용 중</span>
            ) : (
              <button
                className={styles.secondaryButton}
                onClick={() =>
                  void request(
                    { action: "activate", version: version.version },
                    `${version.version} 버전을 활성화했어요.`,
                  )
                }
                type="button"
              >
                이 버전 사용
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className={styles.promptVersionForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (newVersion.trim() && newDescription.trim()) {
            void request(
              {
                action: "create",
                description: newDescription.trim(),
                version: newVersion.trim(),
              },
              "새 prompt version을 등록했어요. 활성화하면 이후 생성에 적용됩니다.",
            );
          }
        }}
      >
        <label className={styles.settingsField} htmlFor="prompt-version-name">
          <span className={styles.label}>새 버전 이름</span>
          <input
            className={styles.input}
            id="prompt-version-name"
            maxLength={80}
            onChange={(event) => setNewVersion(event.target.value)}
            placeholder="예: easyread-v2"
            value={newVersion}
          />
        </label>
        <label
          className={styles.settingsField}
          htmlFor="prompt-version-description"
        >
          <span className={styles.label}>설명</span>
          <input
            className={styles.input}
            id="prompt-version-description"
            maxLength={300}
            onChange={(event) => setNewDescription(event.target.value)}
            placeholder="무엇이 달라진 버전인지 적어주세요"
            value={newDescription}
          />
        </label>
        <div className={styles.settingsActions}>
          <button
            className={styles.secondaryButton}
            disabled={!newVersion.trim() || !newDescription.trim()}
            type="submit"
          >
            버전 등록
          </button>
        </div>
      </form>
    </div>
  );
}
