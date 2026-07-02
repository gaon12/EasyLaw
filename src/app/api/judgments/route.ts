import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  captchaRequiredResponse,
  shouldOfferCaptcha,
  verifyAltchaPayload,
} from "@/lib/captcha";
import { getDatabase } from "@/lib/db";
import {
  searchExternalJudgments,
  syncExternalCatalog,
  upsertJudgmentFromExternal,
} from "@/lib/external-law";
import { JUDGMENT_SEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import {
  matchesJudgmentSearch,
  parseJudgmentSearchQuery,
} from "@/lib/judgment-search";
import { getPublicJudgments } from "@/lib/queries";
import {
  anonymousLimitResponse,
  applyAnonymousCookie,
  checkAnonymousAccess,
} from "@/lib/security/anonymous-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createJudgmentRequest = z.object({
  captchaPayload: z.string().max(12_000).optional(),
  query: z.string().trim().min(1).max(JUDGMENT_SEARCH_QUERY_MAX_LENGTH),
});

export async function GET() {
  const db = getDatabase();
  await syncExternalCatalog(db);
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
  const captchaVerified = await verifyAltchaPayload(
    db,
    body.data.captchaPayload,
  );
  const access = captchaVerified
    ? {
        allowed: true as const,
        anonymousId: "captcha_verified",
        release() {},
      }
    : checkAnonymousAccess(db, request, {
        scope: "judgment_search",
      });
  if (!access.allowed) {
    if (shouldOfferCaptcha(db, access.status)) {
      return captchaRequiredResponse(access.setCookie);
    }
    return anonymousLimitResponse(access);
  }

  try {
    const filters = parseJudgmentSearchQuery(body.data.query);
    const records = filters.text
      ? await searchExternalJudgments(db, filters.text)
      : [];
    for (const record of records) {
      upsertJudgmentFromExternal(db, record);
    }

    const judgments = getPublicJudgments(db).filter((judgment) =>
      matchesJudgmentSearch(judgment, filters),
    );

    return applyAnonymousCookie(
      Response.json({
        count: judgments.length,
        judgments,
      }),
      access,
    );
  } finally {
    access.release();
  }
}
