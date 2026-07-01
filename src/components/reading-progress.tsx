"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "@/app/page.module.css";

const readingRoutes = ["/p/", "/cp/", "/guide", "/research"] as const;

export function ReadingProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const enabled = readingRoutes.some((route) => pathname.startsWith(route));

  useEffect(() => {
    if (!enabled) {
      setProgress(0);
      return;
    }

    function updateProgress() {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(
        scrollable > 0
          ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100))
          : 0,
      );
    }

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <div className={styles.readingProgress} aria-hidden="true">
      <span style={{ inlineSize: `${progress}%` }} />
    </div>
  );
}
