import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { JudgmentDetailView } from "@/components/judgment-detail";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getCustomJudgmentById, getLatestAnalysis } from "@/lib/queries";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "비공개 판결문",
  description: "로그인한 사용자만 볼 수 있는 비공개 판결문입니다.",
  robots: { index: false, follow: false },
});

export default async function CustomJudgmentPage({
  params,
}: PageProps<"/cp/[id]">) {
  const { id } = await params;
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    notFound();
  }
  const judgment = getCustomJudgmentById(db, id, user.id);
  if (!judgment) {
    notFound();
  }

  return (
    <AppShell>
      <JudgmentDetailView
        analysis={getLatestAnalysis(db, judgment.id)}
        judgment={judgment}
        privateDocument
      />
    </AppShell>
  );
}
