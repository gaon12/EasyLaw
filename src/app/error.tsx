"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";
import styles from "./page.module.css";

export default function ErrorPage({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.main}>
      <ErrorState
        eyebrow="앗"
        title="법전 책갈피가 이상한 데 꽂혔어요"
        description="화면을 그리다 잠깐 삐끗했습니다. 다시 시도하면 캐릭터가 책갈피를 바로잡아볼게요."
      />
    </main>
  );
}
