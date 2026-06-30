import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { JudgmentDetailView } from "@/components/judgment-detail";
import { AppShell } from "@/components/site-chrome";
import { getDatabase } from "@/lib/db";
import { getCustomJudgmentById, getLatestAnalysis } from "@/lib/queries";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

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
