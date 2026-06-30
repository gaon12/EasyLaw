"use client";

import { useEffect, useState } from "react";
import styles from "@/app/page.module.css";
import type { SupportedLocale } from "@/lib/i18n";
import { supportedLocales, translations } from "@/lib/i18n";

const localeKey = "easylaw_locale";
const textSizeKey = "easylaw_text_size";
const textSizes = ["normal", "large", "larger"] as const;

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
    <div className={styles.readingControls}>
      <label>
        <span>언어</span>
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
          <option value="ko">한국어</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
        </select>
      </label>
      <fieldset>
        <legend>글자 크기</legend>
        {textSizes.map((size) => (
          <button
            aria-pressed={textSize === size}
            key={size}
            onClick={() => {
              setTextSize(size);
              localStorage.setItem(textSizeKey, size);
              applyTextSize(size);
            }}
            type="button"
          >
            {size === "normal" ? "가" : size === "large" ? "가+" : "가++"}
          </button>
        ))}
      </fieldset>
    </div>
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
