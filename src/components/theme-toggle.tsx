"use client";

import { useEffect, useState } from "react";
import styles from "@/app/page.module.css";
import { MoonIcon, SunIcon } from "@/components/icons";

type Theme = "light" | "dark";

function getCurrentTheme(): Theme {
  const selected = document.documentElement.dataset.theme;
  if (selected === "light" || selected === "dark") {
    return selected;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getCurrentTheme());
  }, []);

  function toggleTheme() {
    const nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("easylaw-theme", nextTheme);
    setTheme(nextTheme);
  }

  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={styles.iconButton}
      onClick={toggleTheme}
      title={isDark ? "라이트 모드" : "다크 모드"}
      type="button"
    >
      {isDark ? <SunIcon size={19} /> : <MoonIcon size={19} />}
    </button>
  );
}
