import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import {
  searchExternalJudgments,
  syncSampleExternalCatalog,
  upsertJudgmentFromExternal,
} from "@/lib/external-law";
import { JUDGMENT_SEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import { createOrAttachGenerationJob } from "@/lib/jobs";
import { getPublicJudgments } from "@/lib/queries";
import {
  anonymousLimitResponse,
  applyAnonymousCookie,
  checkAnonymousAccess,
} from "@/lib/security/anonymous-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createJudgmentRequest = z.object({
  query: z.string().trim().min(1).max(JUDGMENT_SEARCH_QUERY_MAX_LENGTH),
  email: z.string().email().optional(),
});

export async function GET() {
  const db = getDatabase();
  await syncSampleExternalCatalog(db);
  return Response.json({ judgments: getPublicJudgments(db) });
}

export async function POST(request: NextRequest) {
  const body = createJudgmentRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      {
        error: "invalid_request",
        details: body.error.flatten(),
        maxLength: JUDGMENT_SEARCH_QUERY_MAX_LENGTH,
      },
      { status: 400 },
    );
  }

  const db = getDatabase();
  const access = checkAnonymousAccess(db, request, {
    scope: "judgment_search",
  });
  if (!access.allowed) {
    return anonymousLimitResponse(access);
  }

  try {
    const records = await searchExternalJudgments(body.data.query);
    for (const record of records) {
      const judgmentId = upsertJudgmentFromExternal(db, record);
      if (body.data.email) {
        createOrAttachGenerationJob(db, judgmentId, body.data.email);
      }
    }

    return applyAnonymousCookie(
      Response.json({
        count: records.length,
        judgments: getPublicJudgments(db),
      }),
      access,
    );
  } finally {
    access.release();
  }
}
