"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";
import styles from "./page.module.css";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
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
        primaryAction={{ href: "/", label: "홈으로 가기" }}
        secondaryAction={{ href: "/support", label: "고객센터 보기" }}
        extraAction={
          <button
            className={styles.secondaryButton}
            onClick={() => unstable_retry()}
            type="button"
          >
            다시 시도
          </button>
        }
      />
    </main>
  );
}
