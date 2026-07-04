"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import styles from "@/app/page.module.css";

type ReaderTab = "document" | "explanation" | "easyread";

const tabHashes: Record<string, ReaderTab> = {
  "#original-document": "document",
  "#easy-explanation": "explanation",
  "#easy-read": "easyread",
};

export function JudgmentReaderTabs({
  documentPanel,
  explanationPanel,
  easyReadPanel,
}: {
  documentPanel: ReactNode;
  explanationPanel: ReactNode;
  easyReadPanel: ReactNode;
}) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<ReaderTab>("document");

  useEffect(() => {
    function syncTabWithHash() {
      const tab = tabHashes[window.location.hash];
      if (tab) {
        setActiveTab(tab);
      }
    }

    syncTabWithHash();
    window.addEventListener("hashchange", syncTabWithHash);
    return () => window.removeEventListener("hashchange", syncTabWithHash);
  }, []);

  return (
    <div className={styles.viewerTabs} id="reader-tabs">
      <div
        aria-label="본문 읽기 방식"
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
          원본
        </button>
        <button
          aria-controls="easy-explanation"
          aria-selected={activeTab === "explanation"}
          id={`${baseId}-explanation-tab`}
          onClick={() => setActiveTab("explanation")}
          role="tab"
          type="button"
        >
          쉬운 해설
        </button>
        <button
          aria-controls="easy-read"
          aria-selected={activeTab === "easyread"}
          id={`${baseId}-easyread-tab`}
          onClick={() => setActiveTab("easyread")}
          role="tab"
          type="button"
        >
          이지 리드
        </button>
      </div>
      <div hidden={activeTab !== "document"}>{documentPanel}</div>
      <div hidden={activeTab !== "explanation"}>{explanationPanel}</div>
      <div hidden={activeTab !== "easyread"}>{easyReadPanel}</div>
    </div>
  );
}
