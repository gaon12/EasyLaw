"use client";

import { useEffect, useState } from "react";
import styles from "@/app/page.module.css";

export function ErrorNavigationActions() {
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1 && document.referrer.length > 0);
  }, []);

  return (
    <div className={styles.errorActions}>
      <a className={styles.primaryButton} href="/">
        홈으로 이동
      </a>
      {canGoBack && (
        <button
          className={styles.secondaryButton}
          onClick={() => window.history.back()}
          type="button"
        >
          뒤로 돌아가기
        </button>
      )}
    </div>
  );
}
