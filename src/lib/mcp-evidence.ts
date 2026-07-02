import type { McpToolCallResult, McpToolDefinition } from "./mcp-client";

export type McpEvidenceDraft = {
  confidence: "high" | "medium";
  source: string;
  summary: string;
  title: string;
  url?: string;
};

export function evidenceFromMcpResult(
  tool: McpToolDefinition,
  args: Record<string, unknown>,
  result: McpToolCallResult,
): McpEvidenceDraft[] {
  const linked = result.content.flatMap((item) =>
    item.type === "resource_link"
      ? [
          {
            confidence: "high" as const,
            source: `${tool.serverLabel} · ${tool.title}`,
            summary: item.description ?? "MCP 도구가 반환한 원문 자료입니다.",
            title: item.title ?? item.name,
            url: item.uri,
          },
        ]
      : [],
  );
  const text = result.content
    .flatMap((item) => {
      if (item.type === "text") {
        return [item.text];
      }
      if (item.type === "resource" && item.resource.text) {
        return [item.resource.text];
      }
      return [];
    })
    .join("\n");
  const structured =
    result.structuredContent ?? parseJsonObject(text) ?? undefined;
  const records = structured ? findRecordList(structured) : [];
  const normalized = records
    .slice(0, 10)
    .map((record) => normalizeRecord(tool, record))
    .filter((item): item is McpEvidenceDraft => item !== null);

  if (linked.length > 0 || normalized.length > 0) {
    return deduplicate([...linked, ...normalized]);
  }
  if (!text.trim()) {
    return [];
  }

  return [
    {
      confidence: "medium",
      source: `${tool.serverLabel} · ${tool.title}`,
      summary: compact(text, 700),
      title: `${tool.title} 검색 결과${argumentLabel(args)}`,
      url: firstUrl(text),
    },
  ];
}

function findRecordList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) {
    return [];
  }
  for (const key of ["results", "items", "documents", "records", "data"]) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }
    if (isRecord(nested)) {
      const found = findRecordList(nested);
      if (found.length > 0) {
        return found;
      }
    }
  }
  return [value];
}

function normalizeRecord(
  tool: McpToolDefinition,
  record: Record<string, unknown>,
): McpEvidenceDraft | null {
  const title = firstString(record, [
    "title",
    "name",
    "caseName",
    "법령명",
    "사건명",
  ]);
  const caseNumber = firstString(record, [
    "case_number",
    "caseNumber",
    "사건번호",
  ]);
  const summary = firstString(record, [
    "summary",
    "content",
    "text",
    "excerpt",
    "description",
    "판시사항",
    "결정요지",
  ]);
  if (!title && !caseNumber && !summary) {
    return null;
  }
  return {
    confidence: "high",
    source:
      firstString(record, ["source", "provider", "court", "법원명"]) ??
      `${tool.serverLabel} · ${tool.title}`,
    summary: compact(summary ?? JSON.stringify(record), 700),
    title:
      [caseNumber, title].filter(Boolean).join(" ") ||
      `${tool.title} 검색 결과`,
    url: firstString(record, ["url", "sourceUrl", "link", "uri"]),
  };
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed)
      ? parsed
      : Array.isArray(parsed)
        ? { items: parsed }
        : null;
  } catch {
    return null;
  }
}

function argumentLabel(args: Record<string, unknown>) {
  const query = Object.values(args).find(
    (value) => typeof value === "string" && value.trim(),
  );
  return typeof query === "string" ? ` · ${compact(query, 60)}` : "";
}

function firstUrl(value: string) {
  return value.match(/https?:\/\/[^\s<>"')\]]+/)?.[0];
}

function compact(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function deduplicate(evidence: McpEvidenceDraft[]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.source}:${item.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
