"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import styles from "@/app/page.module.css";
import { LLM_PRESETS, type LlmPresetKey } from "@/lib/llm-presets";

export function LlmSettingsForm({
  description,
  initialBaseUrl,
  initialModel,
  initialPreset,
  initialProvider,
}: {
  description: string;
  initialBaseUrl: string;
  initialModel: string;
  initialPreset: LlmPresetKey;
  initialProvider: string;
}) {
  const [presetKey, setPresetKey] = useState<LlmPresetKey>(initialPreset);
  const [provider, setProvider] = useState(initialProvider);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [model, setModel] = useState(initialModel);
  const [message, setMessage] = useState(description);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  function selectPreset(nextPresetKey: LlmPresetKey) {
    setPresetKey(nextPresetKey);
    const preset = LLM_PRESETS.find((item) => item.key === nextPresetKey);
    if (!preset) {
      return;
    }
    setProvider(preset.provider);
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
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
        body: JSON.stringify({ scope: "llm", settings }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      setStatus(response.ok ? "success" : "error");
      setMessage(
        response.ok
          ? "설정을 저장했어요. 다음 질문부터 새 값이 적용됩니다."
          : "설정을 저장하지 못했어요. 권한과 입력값을 확인해 주세요.",
      );
    } catch (_error) {
      setStatus("error");
      setMessage("저장 요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <form className={styles.settingsForm} onSubmit={saveSettings}>
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
      <label className={styles.settingsField} htmlFor="setting-llm_preset">
        <span className={styles.label}>프리셋</span>
        <select
          className={styles.input}
          id="setting-llm_preset"
          name="llm_preset"
          onChange={(event) =>
            selectPreset(event.currentTarget.value as LlmPresetKey)
          }
          value={presetKey}
        >
          {LLM_PRESETS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
          <option value="custom">직접 입력</option>
        </select>
      </label>
      <label className={styles.settingsField} htmlFor="setting-llm_provider">
        <span className={styles.label}>공급자</span>
        <input
          className={styles.input}
          id="setting-llm_provider"
          name="llm_provider"
          onChange={(event) => {
            setPresetKey("custom");
            setProvider(event.currentTarget.value);
          }}
          placeholder="OpenAI, Google 등"
          type="text"
          value={provider}
        />
      </label>
      <label
        className={styles.settingsField}
        htmlFor="setting-llm_api_base_url"
      >
        <span className={styles.label}>API Base URL</span>
        <input
          className={styles.input}
          id="setting-llm_api_base_url"
          name="llm_api_base_url"
          onChange={(event) => {
            setPresetKey("custom");
            setBaseUrl(event.currentTarget.value);
          }}
          placeholder="https://api.openai.com/v1"
          type="text"
          value={baseUrl}
        />
      </label>
      <label className={styles.settingsField} htmlFor="setting-llm_model">
        <span className={styles.label}>모델</span>
        <input
          className={styles.input}
          id="setting-llm_model"
          name="llm_model"
          onChange={(event) => {
            setPresetKey("custom");
            setModel(event.currentTarget.value);
          }}
          placeholder="gpt-5-mini"
          type="text"
          value={model}
        />
      </label>
      <label className={styles.settingsField} htmlFor="setting-llm_api_key">
        <span className={styles.label}>API Key</span>
        <input
          className={styles.input}
          id="setting-llm_api_key"
          name="llm_api_key"
          placeholder="새 키를 입력할 때만 저장"
          type="password"
        />
      </label>
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
