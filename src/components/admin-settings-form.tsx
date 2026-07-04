"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

type Field = {
  key: string;
  label: string;
  options?: { label: string; value: string }[];
  placeholder: string;
  secret?: boolean;
  type?: "text" | "password" | "select";
  value?: string;
};

export function AdminSettingsForm({
  description,
  fields,
  scope,
}: {
  description: string;
  fields: Field[];
  scope: "captcha" | "easyread" | "llm" | "mcp" | "openLaw";
}) {
  const [message, setMessage] = useState(description);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>(
    {},
  );
  const isSavingRef = useRef(false);

  return (
    <form
      className={styles.settingsForm}
      onSubmit={async (event) => {
        event.preventDefault();
        if (isSavingRef.current) {
          return;
        }
        isSavingRef.current = true;
        setIsSaving(true);
        setStatus("idle");
        try {
          const formData = new FormData(event.currentTarget);
          const settings: Record<string, string> = {};
          for (const [key, value] of formData.entries()) {
            if (typeof value === "string") {
              settings[key] = value;
            }
          }
          const response = await fetch("/api/admin/settings", {
            body: JSON.stringify({ scope, settings }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          setStatus(response.ok ? "success" : "error");
          setMessage(
            response.ok
              ? "설정을 저장했어요. 다음 요청부터 새 값이 적용됩니다."
              : "설정을 저장하지 못했어요. 권한과 입력값을 확인해 주세요.",
          );
        } catch (_error) {
          setStatus("error");
          setMessage("저장 요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
        } finally {
          isSavingRef.current = false;
          setIsSaving(false);
        }
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
      {fields.map((field) => (
        <label
          className={styles.settingsField}
          htmlFor={`setting-${field.key}`}
          key={field.key}
        >
          <span className={styles.label}>{field.label}</span>
          {field.type === "select" ? (
            <select
              className={styles.input}
              defaultValue={field.value}
              id={`setting-${field.key}`}
              name={field.key}
            >
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.secret || field.type === "password" ? (
            <span className={styles.secretInputRow}>
              <input
                aria-label={field.label}
                className={styles.input}
                defaultValue={field.value}
                id={`setting-${field.key}`}
                name={field.key}
                placeholder={field.placeholder}
                type={visibleSecrets[field.key] ? "text" : "password"}
              />
              <button
                aria-controls={`setting-${field.key}`}
                aria-label={
                  visibleSecrets[field.key] ? "비밀 값 숨기기" : "비밀 값 보기"
                }
                className={styles.secondaryButton}
                onClick={() =>
                  setVisibleSecrets((current) => ({
                    ...current,
                    [field.key]: !current[field.key],
                  }))
                }
                type="button"
              >
                {visibleSecrets[field.key] ? "숨기기" : "보기"}
              </button>
            </span>
          ) : (
            <input
              aria-label={field.label}
              className={styles.input}
              defaultValue={field.value}
              id={`setting-${field.key}`}
              name={field.key}
              placeholder={field.placeholder}
              type="text"
            />
          )}
        </label>
      ))}
      <div className={styles.settingsActions}>
        <button
          className={styles.primaryButton}
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "저장 중" : "설정 저장"}
        </button>
      </div>
    </form>
  );
}
