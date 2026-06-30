import Image from "next/image";
import type { ReactNode } from "react";
import styles from "@/app/page.module.css";

export function ErrorState({
  eyebrow,
  title,
  description,
  extraAction,
  primaryAction,
  secondaryAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  extraAction?: ReactNode;
  primaryAction: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
}) {
  return (
    <section className={styles.errorState} aria-labelledby="error-title">
      <Image
        alt="돋보기와 서류 사이에서 길을 찾는 EasyLaw 캐릭터"
        className={styles.errorCharacter}
        height={220}
        priority
        src="/error-character.svg"
        width={260}
      />
      <span className={styles.badge}>{eyebrow}</span>
      <h1 id="error-title">{title}</h1>
      <p>{description}</p>
      <div className={styles.errorActions}>
        <a className={styles.primaryButton} href={primaryAction.href}>
          {primaryAction.label}
        </a>
        {secondaryAction && (
          <a className={styles.secondaryButton} href={secondaryAction.href}>
            {secondaryAction.label}
          </a>
        )}
        {extraAction}
      </div>
    </section>
  );
}
