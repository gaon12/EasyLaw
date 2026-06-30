"use client";

import Image from "next/image";
import { useEffect } from "react";
import "./globals.css";
import styles from "./page.module.css";

export default function GlobalError({
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
    <html lang="ko">
      <body>
        <main className={styles.globalErrorShell}>
          <section className={styles.errorState} aria-labelledby="error-title">
            <Image
              alt="돋보기와 서류 사이에서 길을 찾는 EasyLaw 캐릭터"
              className={styles.errorCharacter}
              height={220}
              priority
              src="/error-character.svg"
              width={260}
            />
            <span className={styles.badge}>앗</span>
            <h1 id="error-title">
              서비스 입구에서 판례 더미에 걸려 넘어졌어요
            </h1>
            <p>
              잠깐만요. EasyLaw 캐릭터가 흩어진 서류를 다시 주워 담는 중입니다.
            </p>
            <div className={styles.errorActions}>
              <button
                className={styles.primaryButton}
                onClick={() => unstable_retry()}
                type="button"
              >
                다시 시도
              </button>
              <a className={styles.secondaryButton} href="/">
                홈으로 가기
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
