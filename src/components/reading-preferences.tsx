"use client";

import { useEffect, useState } from "react";
import styles from "@/app/page.module.css";
import { SettingsIcon } from "@/components/icons";
import type { SupportedLocale } from "@/lib/i18n";
import { supportedLocales, translations } from "@/lib/i18n";

const localeKey = "easylaw_locale";
const textSizeKey = "easylaw_text_size";
const textSizeOptions = [
  { label: "기본", value: "normal" },
  { label: "크게", value: "large" },
  { label: "더 크게", value: "larger" },
] as const;
const textSizes = textSizeOptions.map((option) => option.value);

type TextSize = (typeof textSizes)[number];

export function ReadingPreferences() {
  const [locale, setLocale] = useState<SupportedLocale>("ko");
  const [textSize, setTextSize] = useState<TextSize>("normal");

  useEffect(() => {
    const storedLocale = localStorage.getItem(localeKey);
    const storedTextSize = localStorage.getItem(textSizeKey);
    const nextLocale = isLocale(storedLocale) ? storedLocale : browserLocale();
    const nextTextSize = isTextSize(storedTextSize) ? storedTextSize : "normal";
    setLocale(nextLocale);
    setTextSize(nextTextSize);
    applyLocale(nextLocale);
    applyTextSize(nextTextSize);
  }, []);

  return (
    <details className={styles.preferenceMenu}>
      <summary aria-label="언어와 글자 크기 설정" title="보기 설정">
        <SettingsIcon size={18} />
        <span>보기</span>
      </summary>
      <div className={styles.preferencePanel}>
        <label>
          <span className={styles.preferenceLabel}>언어</span>
          <select
            aria-label="언어"
            onChange={(event) => {
              const nextLocale = event.target.value as SupportedLocale;
              setLocale(nextLocale);
              localStorage.setItem(localeKey, nextLocale);
              applyLocale(nextLocale);
            }}
            value={locale}
          >
            <option value="ko">KO</option>
            <option value="en">EN</option>
            <option value="ja">JA</option>
          </select>
        </label>
        <fieldset>
          <legend className={styles.preferenceLabel}>글자</legend>
          {textSizeOptions.map((option) => (
            <button
              aria-pressed={textSize === option.value}
              key={option.value}
              onClick={() => {
                setTextSize(option.value);
                localStorage.setItem(textSizeKey, option.value);
                applyTextSize(option.value);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>
    </details>
  );
}

function applyLocale(locale: SupportedLocale) {
  document.documentElement.lang = locale === "ko" ? "ko" : locale;
  document.documentElement.dataset.locale = locale;
  const dictionary: Readonly<Record<string, string>> = translations[locale];
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key && dictionary[key]) {
      element.textContent = dictionary[key];
    }
  }
}

function applyTextSize(size: TextSize) {
  document.documentElement.dataset.textSize = size;
}

function browserLocale(): SupportedLocale {
  const language = navigator.language.toLowerCase();
  if (language.startsWith("ja")) {
    return "ja";
  }
  if (language.startsWith("en")) {
    return "en";
  }
  return "ko";
}

function isLocale(value: string | null): value is SupportedLocale {
  return supportedLocales.some((locale) => locale === value);
}

function isTextSize(value: string | null): value is TextSize {
  return textSizes.some((size) => size === value);
}
