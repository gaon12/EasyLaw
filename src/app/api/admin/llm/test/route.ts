import { getDatabase } from "@/lib/db";
import {
  isLocalLlmConfiguration,
  LlmError,
  readLlmConfiguration,
  requestLlmText,
} from "@/lib/llm-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const db = getDatabase();
  const configuration = readLlmConfiguration(db);
  if (!configuration) {
    return Response.json(
      {
        error: "llm_not_configured",
        message:
          "공급자, API Base URL, 모델명을 먼저 저장해 주세요. 로컬 공급자가 아니면 API Key도 필요합니다.",
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const sample = await requestLlmText(configuration, [
      {
        role: "system",
        content: "간단한 연결 확인입니다. 다른 말 없이 요청한 답만 출력하세요.",
      },
      { role: "user", content: "'연결 확인 완료'라고만 답하세요." },
    ]);
    return Response.json({
      latencyMs: Date.now() - startedAt,
      local: isLocalLlmConfiguration(configuration),
      model: configuration.model,
      ok: true,
      sample: sample.slice(0, 120),
    });
  } catch (error) {
    const message =
      error instanceof LlmError
        ? error.message
        : "알 수 없는 오류로 LLM 연결 테스트에 실패했습니다.";
    return Response.json(
      {
        error: error instanceof LlmError ? error.code : "llm_test_failed",
        latencyMs: Date.now() - startedAt,
        message,
        ok: false,
      },
      { status: 502 },
    );
  }
}
