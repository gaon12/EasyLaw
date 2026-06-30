import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  isDictionarySource,
  updateDictionarySource,
  updateDownloadableDictionaries,
} from "@/lib/dictionary";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  source: z.string().optional(),
});

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
  if (
    source !== "all" &&
    source !== "basic" &&
    source !== "standard" &&
    !isDictionarySource(source)
  ) {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }
  if (source === "legal") {
    return Response.json({ error: "invalid_source" }, { status: 400 });
  }

  const result =
    source === "all"
      ? await updateDownloadableDictionaries(db)
      : await updateDictionarySource(
          db,
          source === "basic" ? "basic" : "standard",
        );
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
