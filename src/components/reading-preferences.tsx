"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const pathname = usePathname();
  const [locale, setLocale] = useState<SupportedLocale>("ko");
  const [textSize, setTextSize] = useState<TextSize>("normal");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    applyLocale(locale, pathname);
  }, [locale, pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.preferenceMenu} ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="언어와 글자 크기 설정"
        className={styles.preferenceButton}
        onClick={() => setOpen((current) => !current)}
        title="보기 설정"
        type="button"
      >
        <SettingsIcon size={18} />
        <span>보기</span>
      </button>
      {open && (
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
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
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
      )}
    </div>
  );
}

function applyLocale(
  locale: SupportedLocale,
  pathname = window.location.pathname,
) {
  document.documentElement.lang = locale === "ko" ? "ko" : locale;
  document.documentElement.dataset.locale = locale;
  // 서버 컴포넌트가 첫 페인트부터 번역을 렌더링할 수 있도록 쿠키에도 저장한다.
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API는 Firefox/Safari에서 아직 쓸 수 없다.
  document.cookie = `easylaw_locale=${locale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  const dictionary: Readonly<Record<string, string>> = translations[locale];
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key && dictionary[key]) {
      element.textContent = dictionary[key];
    }
  }
  const titleKey = document.querySelector<HTMLMetaElement>(
    'meta[name="easylaw-title-key"]',
  )?.content;
  const fallbackTitleKey = pathname === "/" ? "meta.home.title" : undefined;
  const nextTitle = titleKey
    ? dictionary[titleKey]
    : fallbackTitleKey
      ? dictionary[fallbackTitleKey]
      : undefined;
  if (nextTitle) {
    document.title = nextTitle;
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
