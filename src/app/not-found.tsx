import { ErrorState } from "@/components/error-state";
import { AppShell } from "@/components/site-chrome";
import { pageMetadata } from "@/lib/metadata";
import styles from "./page.module.css";

export const metadata = pageMetadata({
  title: "길 잃은 판결문",
  description: "요청한 페이지를 찾을 수 없습니다.",
  robots: { index: false, follow: false },
});

export default function NotFound() {
  return (
    <AppShell>
      <main className={styles.main}>
        <ErrorState
          eyebrow="404"
          title="판결문이 잠깐 숨바꼭질 중이에요"
          description="주소를 다시 확인해 주세요. 캐릭터가 돋보기까지 들었는데도 이 페이지는 아직 못 찾았어요."
        />
      </main>
    </AppShell>
  );
}
