import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  getDictionaryImportProgress,
  isDictionarySource,
  updateDictionarySource,
  updateDownloadableDictionaries,
  updateOpenLawLegalDictionary,
} from "@/lib/dictionary";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  source: z.string().optional(),
});

export async function GET(request: Request) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (user?.role !== "super_admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "all";
  if (source !== "all" && !isDictionarySource(source)) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }

  return Response.json({
    ok: true,
    progress: getDictionaryImportProgress(
      db,
      source === "all" ? undefined : source,
    ),
  });
}

export async function POST(request: Request) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (user?.role !== "super_admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const input = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!input.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const source = input.data.source ?? "all";
  if (source !== "all" && !isDictionarySource(source)) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }

  const result =
    source === "all"
      ? await updateDownloadableDictionaries(db)
      : source === "legal"
        ? await updateOpenLawLegalDictionary(db)
        : await updateDictionarySource(
            db,
            source === "basic" ? "basic" : "standard",
          );
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
