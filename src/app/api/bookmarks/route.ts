import { cookies } from "next/headers";
import { z } from "zod";
import { addJudgmentBookmark, removeJudgmentBookmark } from "@/lib/bookmarks";
import { getDatabase } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bookmarkRequest = z.object({
  judgmentId: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  const input = bookmarkRequest.safeParse(await request.json());
  if (!input.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = addJudgmentBookmark(db, {
    judgmentId: input.data.judgmentId,
    userId: user.id,
  });
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 404 });
  }

  return Response.json({ bookmarked: true });
}

export async function DELETE(request: Request) {
  const input = bookmarkRequest.safeParse(await request.json());
  if (!input.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  removeJudgmentBookmark(db, {
    judgmentId: input.data.judgmentId,
    userId: user.id,
  });

  return Response.json({ bookmarked: false });
}
