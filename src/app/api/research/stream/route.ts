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
import { answerDetailLevels } from "@/lib/research-options";
import {
  anonymousLimitResponse,
  applyAnonymousCookie,
  checkAnonymousAccess,
} from "@/lib/security/anonymous-access";

const requestSchema = z.object({
  answerDetail: z.enum(answerDetailLevels).default("simple"),
  captchaPayload: z.string().max(12_000).optional(),
  easyExplanation: z.boolean().default(false),
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
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          closed = true;
        }
      };
      // 로컬 LLM은 첫 토큰까지 수 분 걸릴 수 있어 프록시의 유휴 연결 종료를
      // 막기 위해 주기적으로 SSE 주석을 보낸다.
      const heartbeat = setInterval(() => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);
      void (async () => {
        try {
          await buildResearchPlan(
            db,
            parsed.data.query,
            (event) => {
              switch (event.type) {
                case "plan":
                  send("plan", event.plan);
                  break;
                case "evidence":
                  send("evidence", event.evidence);
                  break;
                case "answer":
                  send("answer", {
                    text: event.answer,
                    verified: event.verified,
                  });
                  break;
                case "skill":
                  send("skill", event.skill);
                  break;
                case "progress":
                  send("progress", {
                    detail: event.detail,
                    status: event.status,
                    title: event.title,
                  });
                  break;
                case "warning":
                  send("warning", event.message);
                  break;
                case "tool":
                  send("tool", {
                    stage: event.stage,
                    tool: event.tool,
                  });
                  break;
                case "phase":
                  send("phase", event.phase);
                  break;
              }
            },
            {
              answerDetail: parsed.data.answerDetail,
              easyExplanation: parsed.data.easyExplanation,
            },
          );
          send("done", { ok: true });
        } catch (error) {
          const code =
            error instanceof LlmError ? error.code : "research_failed";
          const message =
            error instanceof LlmError
              ? error.message
              : "법률 질문을 처리하지 못했습니다.";
          send("error", { code, message });
        } finally {
          clearInterval(heartbeat);
          access.release();
          closed = true;
          try {
            controller.close();
          } catch {
            // 클라이언트가 먼저 연결을 끊은 경우
          }
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
