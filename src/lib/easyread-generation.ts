import { z } from "zod";
import type { SqliteDatabase } from "./db";
import { completeGenerationJob, failGenerationJob } from "./jobs";
import { getJudgmentText } from "./judgment-texts";
import {
  type LlmConfiguration,
  LlmError,
  readLlmConfiguration,
  requestLlmText,
} from "./llm-client";
import { getSetting } from "./settings";
import type { EasyReadAnalysis } from "./types";

export function isReviewRequired(db: SqliteDatabase) {
  return getSetting(db, "easyread_review_required") === "1";
}

function activePromptVersion(db: SqliteDatabase) {
  return (
    db
      .prepare<[], { version: string }>(
        `SELECT version FROM prompt_versions
          WHERE is_active = 1
          ORDER BY created_at DESC
          LIMIT 1`,
      )
      .get()?.version ?? EASYREAD_PROMPT_VERSION
  );
}

export const EASYREAD_PROMPT_VERSION = "easyread-v1";
const MAX_ATTEMPTS = 3;
const MAX_SOURCE_CHARS = 24_000;

const shortLine = z.string().trim().min(1).max(500);
const analysisSchema = z.object({
  summary: shortLine,
  easyRead: z.array(shortLine).min(1).max(12),
  timeline: z.array(shortLine).max(12).default([]),
  claims: z.array(shortLine).max(12).default([]),
  courtReasoning: z.array(shortLine).max(12).default([]),
  finalResult: shortLine,
  terms: z
    .array(z.object({ term: shortLine, explanation: shortLine }))
    .max(12)
    .default([]),
  sourceGrounds: z
    .array(z.object({ label: shortLine, excerpt: z.string().trim().min(1) }))
    .max(8)
    .default([]),
  unknowns: z.array(shortLine).max(8).default([]),
  warnings: z.array(shortLine).max(8).default([]),
});

const requiredWarnings = [
  "이 서비스는 법률자문이 아니라 문서 이해 보조 도구입니다.",
  "중요한 법적 판단은 변호사 등 전문가에게 확인해야 합니다.",
];

type JudgmentForGeneration = {
  id: string;
  case_number: string;
  court_name: string;
  decided_on: string;
  title: string;
  case_type: string;
};

export async function generateEasyReadAnalysis(
  configuration: LlmConfiguration,
  judgment: {
    caseNumber: string;
    caseType: string;
    courtName: string;
    decidedOn: string;
    title: string;
  },
  originalText: string,
): Promise<EasyReadAnalysis> {
  const truncated = originalText.length > MAX_SOURCE_CHARS;
  const source = truncated
    ? originalText.slice(0, MAX_SOURCE_CHARS)
    : originalText;
  const response = await requestLlmText(configuration, [
    {
      role: "system",
      content: `당신은 대한민국 판결문·법률 문서를 일반인이 이해하기 쉬운 설명으로 바꾸는 도우미다.
반드시 JSON 객체 하나만 출력한다. 문서에 없는 사실을 지어내지 않는다.
모든 문장은 중학생도 이해할 수 있는 쉬운 한국어 존댓말(-습니다)로 쓴다.

스키마:
{
  "summary": "문서 전체를 한두 문장으로 요약",
  "easyRead": ["문서 내용을 순서대로 쉬운 문장으로 풀어쓴 목록"],
  "timeline": ["사건이 일어난 순서"],
  "claims": ["각 당사자의 주장"],
  "courtReasoning": ["법원(또는 문서 작성 기관)의 판단 이유"],
  "finalResult": "최종 결론 한 문장",
  "terms": [{"term": "어려운 법률 용어", "explanation": "쉬운 설명"}],
  "sourceGrounds": [{"label": "결론|판단 이유 등", "excerpt": "원문에서 그대로 옮긴 근거 문장"}],
  "unknowns": ["이 문서만으로 알 수 없는 것"],
  "warnings": ["이용자가 주의할 점"]
}

규칙:
- sourceGrounds의 excerpt는 원문에 실제로 있는 문장만 사용한다.
- 법령·행정규칙처럼 판결문이 아닌 문서면 timeline과 claims는 빈 배열로 두고 easyRead에 집중한다.
- 결론이 원문에 명시되지 않으면 finalResult에 "이 문서에는 명시적인 결론이 없습니다."라고 쓴다.
- 승패 예측, 유불리 조언, 법률 자문 표현은 쓰지 않는다.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        caseNumber: judgment.caseNumber,
        caseType: judgment.caseType,
        courtName: judgment.courtName,
        decidedOn: judgment.decidedOn,
        originalText: source,
        originalTextTruncated: truncated,
        title: judgment.title,
      }),
    },
  ]);
  const parsed = parseAnalysisJson(response);
  return {
    ...parsed,
    unknowns: truncated
      ? [
          ...parsed.unknowns,
          "원문이 길어 일부만 분석에 사용했습니다. 전체 내용은 원문에서 확인해 주세요.",
        ]
      : parsed.unknowns,
    warnings: [
      ...parsed.warnings.filter(
        (warning) => !requiredWarnings.includes(warning),
      ),
      ...requiredWarnings,
    ],
  };
}

function parseAnalysisJson(response: string) {
  const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate =
    fenced ??
    response.slice(response.indexOf("{"), response.lastIndexOf("}") + 1);
  try {
    return analysisSchema.parse(JSON.parse(candidate));
  } catch {
    throw new LlmError(
      "llm_response_invalid",
      "LLM이 Easy-Read 분석 스키마에 맞는 JSON을 반환하지 않았습니다.",
    );
  }
}

export type GenerationJobResult =
  | { ok: true; jobId: string }
  | {
      ok: false;
      jobId: string | null;
      reason:
        | "no_queued_job"
        | "job_not_found"
        | "llm_not_configured"
        | "missing_original_text"
        | "generation_failed";
      message?: string;
    };

/** 지정된 작업 하나를 실제 LLM으로 생성한다. */
export async function processGenerationJob(
  db: SqliteDatabase,
  jobId: string,
): Promise<GenerationJobResult> {
  const configuration = readLlmConfiguration(db);
  if (!configuration) {
    return { jobId, ok: false, reason: "llm_not_configured" };
  }

  const now = new Date().toISOString();
  const locked = db
    .prepare(
      `UPDATE judgment_generation_jobs
        SET status = 'generating', locked_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ? AND status IN ('queued', 'generating')`,
    )
    .run(now, now, jobId);
  if (locked.changes === 0) {
    return { jobId, ok: false, reason: "job_not_found" };
  }

  return runGeneration(db, configuration, jobId);
}

/** 대기 중인 생성 작업을 오래된 순서로 최대 limit개 처리한다. */
export async function processDueGenerationJobs(db: SqliteDatabase, limit = 3) {
  const configuration = readLlmConfiguration(db);
  if (!configuration) {
    return [];
  }

  const results: GenerationJobResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const now = new Date().toISOString();
    const job = db
      .prepare<[], { id: string }>(
        `SELECT id
          FROM judgment_generation_jobs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1`,
      )
      .get();
    if (!job) {
      break;
    }
    db.prepare(
      `UPDATE judgment_generation_jobs
        SET status = 'generating', locked_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ? AND status = 'queued'`,
    ).run(now, now, job.id);
    results.push(await runGeneration(db, configuration, job.id));
  }
  return results;
}

async function runGeneration(
  db: SqliteDatabase,
  configuration: LlmConfiguration,
  jobId: string,
): Promise<GenerationJobResult> {
  const job = db
    .prepare<[string], { id: string; judgment_id: string; attempts: number }>(
      `SELECT id, judgment_id, attempts
        FROM judgment_generation_jobs
        WHERE id = ?`,
    )
    .get(jobId);
  if (!job) {
    return { jobId, ok: false, reason: "job_not_found" };
  }

  const judgment = db
    .prepare<[string], JudgmentForGeneration>(
      `SELECT id, case_number, court_name, decided_on, title, case_type
        FROM judgments
        WHERE id = ?`,
    )
    .get(job.judgment_id);
  const originalText = judgment ? getJudgmentText(db, judgment.id) : null;
  if (!judgment || !originalText?.trim()) {
    failGenerationJob(
      db,
      jobId,
      "원문이 없어 Easy-Read 설명을 생성할 수 없습니다.",
    );
    return { jobId, ok: false, reason: "missing_original_text" };
  }

  try {
    const analysis = await generateEasyReadAnalysis(
      configuration,
      {
        caseNumber: judgment.case_number,
        caseType: judgment.case_type,
        courtName: judgment.court_name,
        decidedOn: judgment.decided_on,
        title: judgment.title,
      },
      originalText,
    );
    await completeGenerationJob(
      db,
      jobId,
      {
        analysis,
        modelName: configuration.model,
        promptVersion: activePromptVersion(db),
      },
      { review: isReviewRequired(db) },
    );
    return { jobId, ok: true };
  } catch (error) {
    const message =
      error instanceof LlmError
        ? error.message
        : "알 수 없는 오류로 생성에 실패했습니다.";
    if (job.attempts >= MAX_ATTEMPTS) {
      failGenerationJob(db, jobId, message);
    } else {
      // 다음 스케줄러 주기에 다시 시도한다.
      db.prepare(
        `UPDATE judgment_generation_jobs
          SET status = 'queued', failure_reason = ?, updated_at = ?
          WHERE id = ?`,
      ).run(message, new Date().toISOString(), jobId);
    }
    return { jobId, message, ok: false, reason: "generation_failed" };
  }
}
