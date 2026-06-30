"use client";

import Image from "next/image";
import { useEffect } from "react";
import { ErrorNavigationActions } from "@/components/error-navigation-actions";
import "./globals.css";
import styles from "./page.module.css";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
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
              height={390}
              priority
              src="/error-character.png"
              width={520}
            />
            <span className={styles.badge}>앗</span>
            <h1 id="error-title">
              서비스 입구에서 판례 더미에 걸려 넘어졌어요
            </h1>
            <p>
              잠깐만요. EasyLaw 캐릭터가 흩어진 서류를 다시 주워 담는 중입니다.
            </p>
            <ErrorNavigationActions />
          </section>
        </main>
      </body>
    </html>
  );
}
