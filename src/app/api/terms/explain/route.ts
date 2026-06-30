import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { buildTermExplanation } from "@/lib/dictionary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  context: z.string().trim().max(500).optional(),
  term: z.string().trim().min(1).max(40),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json({ error: "invalid_term" }, { status: 400 });
  }

  return Response.json(buildTermExplanation(getDatabase(), parsed.data));
}
