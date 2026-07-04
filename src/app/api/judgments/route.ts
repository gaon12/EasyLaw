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
  sortJudgments,
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
  query: z.string().trim().max(JUDGMENT_SEARCH_QUERY_MAX_LENGTH),
  categories: z
    .array(z.enum(["judgment", "law"]))
    .max(2)
    .optional(),
  caseType: z
    .enum(["civil", "criminal", "administrative", "family", "constitutional"])
    .optional(),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
  sort: z.enum(["newest", "oldest", "title"]).optional(),
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
    if (body.data.categories) {
      filters.categories = body.data.categories;
    }
    if (body.data.caseType) {
      filters.caseType = body.data.caseType;
    }
    if (body.data.yearFrom) {
      filters.yearFrom = body.data.yearFrom;
    }
    if (body.data.yearTo) {
      filters.yearTo = body.data.yearTo;
    }
    const records = filters.text
      ? await searchExternalJudgments(db, filters.text)
      : [];
    for (const record of records) {
      upsertJudgmentFromExternal(db, record);
    }

    const judgments = sortJudgments(
      getPublicJudgments(db).filter((judgment) =>
        matchesJudgmentSearch(judgment, filters),
      ),
      body.data.sort,
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
