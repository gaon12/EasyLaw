import Image from "next/image";
import styles from "@/app/page.module.css";
import { ErrorNavigationActions } from "./error-navigation-actions";

export function ErrorState({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className={styles.errorState} aria-labelledby="error-title">
      <Image
        alt="돋보기와 서류 사이에서 길을 찾는 EasyLaw 캐릭터"
        className={styles.errorCharacter}
        height={390}
        priority
        src="/error-character.png"
        width={520}
      />
      <span className={styles.badge}>{eyebrow}</span>
      <h1 id="error-title">{title}</h1>
      <p>{description}</p>
      <ErrorNavigationActions />
    </section>
  );
}
