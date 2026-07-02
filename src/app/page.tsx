import { cookies } from "next/headers";
import { PublicHome, SignedInHome } from "@/components/home-sections";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getDashboardSnapshot, getPublicJudgments } from "@/lib/queries";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "판결문을 이해하기 쉽게",
  description:
    "공개 판결문 검색, 비공개 문서 저장, AI 법률 질문을 한곳에서 시작하세요.",
  path: "/",
  titleKey: "meta.home.title",
});

export default async function Home() {
  const db = getDatabase();
  const sessionUser = getSessionUser(
    db,
    (await cookies()).get(SESSION_COOKIE)?.value,
  );

  if (!sessionUser) {
    return (
      <AppShell>
        <PublicHome />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <SignedInHome
        displayName={sessionUser.displayName}
        judgments={getPublicJudgments(db, { limit: 3 })}
        snapshot={getDashboardSnapshot(db)}
      />
    </AppShell>
  );
}
