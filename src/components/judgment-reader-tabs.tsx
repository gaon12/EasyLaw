"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import styles from "@/app/page.module.css";

type ReaderTab = "document" | "explanation";

export function JudgmentReaderTabs({
  documentPanel,
  explanationPanel,
}: {
  documentPanel: ReactNode;
  explanationPanel: ReactNode;
}) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<ReaderTab>("document");

  useEffect(() => {
    function syncTabWithHash() {
      if (window.location.hash === "#easy-explanation") {
        setActiveTab("explanation");
        return;
      }
      if (window.location.hash === "#original-document") {
        setActiveTab("document");
      }
    }

    syncTabWithHash();
    window.addEventListener("hashchange", syncTabWithHash);
    return () => window.removeEventListener("hashchange", syncTabWithHash);
  }, []);

  return (
    <div className={styles.viewerTabs} id="reader-tabs">
      <div
        aria-label="판결문 읽기 방식"
        className={styles.viewerTabList}
        role="tablist"
      >
        <button
          aria-controls="original-document"
          aria-selected={activeTab === "document"}
          id={`${baseId}-document-tab`}
          onClick={() => setActiveTab("document")}
          role="tab"
          type="button"
        >
          판결문
        </button>
        <button
          aria-controls="easy-explanation"
          aria-selected={activeTab === "explanation"}
          id={`${baseId}-explanation-tab`}
          onClick={() => setActiveTab("explanation")}
          role="tab"
          type="button"
        >
          쉬운 판결문
        </button>
      </div>
      <div hidden={activeTab !== "document"}>{documentPanel}</div>
      <div hidden={activeTab !== "explanation"}>{explanationPanel}</div>
    </div>
  );
}
