import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  searchExternalJudgments,
  syncSampleExternalCatalog,
  upsertJudgmentFromExternal,
} from "@/lib/external-law";
import { createOrAttachGenerationJob } from "@/lib/jobs";
import { getPublicJudgments } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createJudgmentRequest = z.object({
  query: z.string().min(1).max(100),
  email: z.string().email().optional(),
});

export async function GET() {
  const db = getDatabase();
  await syncSampleExternalCatalog(db);
  return Response.json({ judgments: getPublicJudgments(db) });
}

export async function POST(request: Request) {
  const body = createJudgmentRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDatabase();
  const records = await searchExternalJudgments(body.data.query);
  for (const record of records) {
    const judgmentId = upsertJudgmentFromExternal(db, record);
    if (body.data.email) {
      createOrAttachGenerationJob(db, judgmentId, body.data.email);
    }
  }

  return Response.json({
    count: records.length,
    judgments: getPublicJudgments(db),
  });
}
