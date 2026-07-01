import { cookies } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  addLegalDictionaryTerm,
  listLegalDictionaryTerms,
} from "@/lib/dictionary";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  definition: z.string().trim().min(2).max(1000),
  origin: z.string().trim().max(200).optional(),
  partOfSpeech: z.string().trim().max(40).optional(),
  word: z.string().trim().min(1).max(80),
});

export async function GET(request: Request) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (user?.role !== "super_admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  return Response.json({ terms: listLegalDictionaryTerms(db, query) });
}

export async function POST(request: Request) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (user?.role !== "super_admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const input = requestSchema.safeParse(await request.json());
  if (!input.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const importedCount = addLegalDictionaryTerm(db, input.data);
  return Response.json({
    importedCount,
    ok: true,
    terms: listLegalDictionaryTerms(db, input.data.word),
  });
}
