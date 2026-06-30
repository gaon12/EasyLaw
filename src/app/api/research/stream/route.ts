import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { LEGAL_RESEARCH_QUERY_MAX_LENGTH } from "@/lib/input-limits";
import { buildResearchPlan } from "@/lib/legal-research";
import {
  anonymousLimitResponse,
  applyAnonymousCookie,
  checkAnonymousAccess,
} from "@/lib/security/anonymous-access";

const requestSchema = z.object({
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
  const access = checkAnonymousAccess(db, request, {
    costly: true,
    scope: "legal_research",
  });
  if (!access.allowed) {
    return anonymousLimitResponse(access);
  }

  const plan = buildResearchPlan(db, parsed.data.query);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        };

        send("plan", {
          coverageLabel: plan.coverageLabel,
          coverageLevel: plan.coverageLevel,
          intent: plan.intent,
          modelLabel: plan.modelLabel,
          steps: plan.steps,
        });

        for (const item of plan.evidence) {
          send("evidence", item);
          await delay(40);
        }

        for (const token of chunkText(plan.answer, 18)) {
          send("token", token);
          await delay(12);
        }

        send("done", { ok: true });
        controller.close();
      } finally {
        access.release();
      }
    },
  });

  return applyAnonymousCookie(
    new Response(stream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    }),
    access,
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(value: string, chunkSize: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
}
