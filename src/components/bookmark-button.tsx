"use client";

import { useState } from "react";
import styles from "@/app/page.module.css";

export function BookmarkButton({
  initialActive = false,
  judgmentId,
}: {
  initialActive?: boolean;
  judgmentId: string;
}) {
  const [active, setActive] = useState(initialActive);
  const [pending, setPending] = useState(false);

  async function toggleBookmark() {
    if (pending) {
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/bookmarks", {
        method: active ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgmentId }),
      });
      if (response.status === 401) {
        window.location.assign(
          `/login?next=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      if (!response.ok) {
        return;
      }
      setActive((current) => !current);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      aria-pressed={active}
      className={active ? styles.infoButton : styles.secondaryButton}
      disabled={pending}
      onClick={toggleBookmark}
      type="button"
    >
      {pending ? "저장 중" : active ? "북마크됨" : "북마크"}
    </button>
  );
}
