import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  captchaRequiredResponse,
  shouldOfferCaptcha,
  verifyAltchaPayload,
} from "@/lib/captcha";
import { getDatabase } from "@/lib/db";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import {
  buildResearchPlan,
  isResearchHarnessConfigured,
} from "@/lib/legal-research";
import { LlmError } from "@/lib/llm-client";
import {
  anonymousLimitResponse,
  applyAnonymousCookie,
  checkAnonymousAccess,
} from "@/lib/security/anonymous-access";

const requestSchema = z.object({
  captchaPayload: z.string().max(12_000).optional(),
  query: z.string().trim().min(2).max(LEGAL_RESEARCH_QUERY_MAX_LENGTH),
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid_query",
        maxLength: LEGAL_RESEARCH_QUERY_MAX_LENGTH,
      },
      { status: 400 },
    );
  }

  const db = getDatabase();
  const captchaVerified = await verifyAltchaPayload(
    db,
    parsed.data.captchaPayload,
  );
  const access = captchaVerified
    ? {
        allowed: true as const,
        anonymousId: "captcha_verified",
        release() {},
      }
    : checkAnonymousAccess(db, request, {
        costly: true,
        scope: "legal_research",
      });
  if (!access.allowed) {
    if (shouldOfferCaptcha(db, access.status)) {
      return captchaRequiredResponse(access.setCookie);
    }
    return anonymousLimitResponse(access);
  }

  if (!isResearchHarnessConfigured(db)) {
    access.release();
    return Response.json(
      {
        error: "llm_not_configured",
        message: "관리자 LLM 설정을 먼저 완료해 주세요.",
      },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      void (async () => {
        try {
          const send = (event: string, data: unknown) => {
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          };
          const plan = await buildResearchPlan(
            db,
            parsed.data.query,
            (event) => {
              if (event.type === "plan") {
                send("plan", event.plan);
              } else if (event.type === "evidence") {
                send("evidence", event.evidence);
              } else {
                send("phase", event.phase);
              }
            },
          );

          for (const token of chunkText(plan.answer, 48)) {
            send("token", token);
          }
          send("done", { ok: true });
        } catch (error) {
          const code =
            error instanceof LlmError ? error.code : "research_failed";
          const message =
            error instanceof LlmError
              ? error.message
              : "법률 질문을 처리하지 못했습니다.";
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ code, message })}\n\n`,
            ),
          );
        } finally {
          access.release();
          controller.close();
        }
      })();
    },
  });

  return applyAnonymousCookie(
    new Response(stream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    }),
    access,
  );
}

function chunkText(value: string, chunkSize: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
}
