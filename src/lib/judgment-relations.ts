export type RelatedCaseReference = {
  caseNumber: string;
  label: "원심판결" | "제1심판결" | "관련 판결";
  excerpt: string;
};

const caseNumberPattern = /\b\d{4}[가-힣]{1,4}\d{1,8}\b/g;

export function extractRelatedCaseReferences(
  originalText: string | null,
  currentCaseNumber: string,
): RelatedCaseReference[] {
  if (!originalText) {
    return [];
  }

  const references = new Map<string, RelatedCaseReference>();
  for (const line of normalizeLines(originalText)) {
    const matches = line.match(caseNumberPattern) ?? [];
    for (const caseNumber of matches) {
      if (caseNumber === currentCaseNumber || references.has(caseNumber)) {
        continue;
      }
      references.set(caseNumber, {
        caseNumber,
        excerpt: line.slice(0, 140),
        label: relationLabel(line),
      });
    }
  }

  return [...references.values()].slice(0, 6);
}

function normalizeLines(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function relationLabel(line: string): RelatedCaseReference["label"] {
  if (/원심|항소심|2심|제2심/.test(line)) {
    return "원심판결";
  }
  if (/1심|제1심|제일심/.test(line)) {
    return "제1심판결";
  }
  return "관련 판결";
}
