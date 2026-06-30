"use client";

import { useState } from "react";
import styles from "@/app/page.module.css";

type Field = {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  value?: string;
};

export function AdminSettingsForm({
  description,
  fields,
  scope,
}: {
  description: string;
  fields: Field[];
  scope: "llm" | "mcp";
}) {
  const [message, setMessage] = useState(description);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSaving, setIsSaving] = useState(false);

  return (
    <form
      className={styles.settingsForm}
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSaving(true);
        setStatus("idle");
        const formData = new FormData(event.currentTarget);
        const settings = Object.fromEntries(formData.entries());
        const response = await fetch("/api/admin/settings", {
          body: JSON.stringify({ scope, settings }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        setIsSaving(false);
        setStatus(response.ok ? "success" : "error");
        setMessage(
          response.ok
            ? "설정을 저장했어요. 다음 질문부터 하네스가 이 값을 참조합니다."
            : "설정을 저장하지 못했어요. 권한과 입력값을 확인해 주세요.",
        );
      }}
    >
      {fields.map((field) => (
        <label className={styles.settingsField} key={field.key}>
          <span className={styles.label}>{field.label}</span>
          <input
            className={styles.input}
            defaultValue={field.value}
            name={field.key}
            placeholder={field.placeholder}
            type={field.secret ? "password" : "text"}
          />
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
    </form>
  );
}
