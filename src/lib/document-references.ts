export type DocumentReferenceCandidate = {
  kind: "case" | "law";
  lookupText: string;
  text: string;
};

export type DocumentReferenceLink = {
  caseNumber: string | null;
  dateLabel: string;
  detailHref: string;
  id: string;
  kind: "case" | "law";
  lookupText: string;
  source: string;
  summary: string | null;
  title: string;
};

const caseNumberPattern = /\b\d{4}[가-힣]{1,4}\d{1,8}\b/g;
const quotedLawPattern =
  /[「『]([^」』\n]{2,80}?(?:특례법|시행령|시행규칙|법률|법|령|규칙|조례|고시|훈령|예규|규정))[」』]/g;
const articleLawPattern =
  /((?:구\s+)?[가-힣·ㆍ\s]{1,42}?(?:특례법|시행령|시행규칙|법률|법|령|규칙|조례|고시|훈령|예규|규정))\s+제\d+조(?:의\d+)?/g;

export function extractDocumentReferenceCandidates(
  originalText: string | null,
  currentCaseNumber: string,
): DocumentReferenceCandidate[] {
  if (!originalText) {
    return [];
  }

  const references = new Map<string, DocumentReferenceCandidate>();
  const normalized = originalText.replace(/\s+/g, " ");
  for (const match of normalized.matchAll(caseNumberPattern)) {
    const text = match[0];
    if (text === currentCaseNumber) {
      continue;
    }
    references.set(`case:${text}`, {
      kind: "case",
      lookupText: text,
      text,
    });
  }

  for (const match of normalized.matchAll(quotedLawPattern)) {
    const rawTitle = match[1];
    const title = normalizeLawTitle(rawTitle);
    if (!title) {
      continue;
    }
    references.set(`law:${title}`, {
      kind: "law",
      lookupText: title,
      text: normalizeLawMention(rawTitle) || title,
    });
  }

  for (const match of normalized.matchAll(articleLawPattern)) {
    const rawTitle = match[1];
    const title = normalizeLawTitle(rawTitle);
    if (!title || title.length < 2) {
      continue;
    }
    references.set(`law:${title}`, {
      kind: "law",
      lookupText: title,
      text: normalizeLawMention(rawTitle) || title,
    });
  }

  return [...references.values()].slice(0, 40);
}

function normalizeLawTitle(value: string | undefined) {
  let title = normalizeLawMention(value);
  const oldLawPrefixIndex = title.lastIndexOf("구 ");
  if (oldLawPrefixIndex > 0) {
    title = title.slice(oldLawPrefixIndex);
  }
  title = title
    .replace(/^(?:및|또는)\s+/, "")
    .replace(/^[가-힣]{1,4}[와과]\s+/, "")
    .replace(/^구\s+/, "");
  return title.trim();
}

function normalizeLawMention(value: string | undefined) {
  let text = value?.replace(/\s+/g, " ").trim() ?? "";
  const oldLawPrefixIndex = text.lastIndexOf("구 ");
  if (oldLawPrefixIndex > 0) {
    text = text.slice(oldLawPrefixIndex);
  }
  return extractLawMentionTail(
    text
      .replace(/^(?:및|또는)\s+/, "")
      .replace(/^[가-힣]{1,4}[와과]\s+/, "")
      .trim(),
  );
}

function extractLawMentionTail(value: string) {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return value;
  }

  const searchStart = Math.max(0, tokens.length - 6);
  for (let index = searchStart; index < tokens.length; index += 1) {
    const candidate = tokens.slice(index).join(" ");
    if (
      isSentenceFragmentStart(tokens[index]) ||
      !lawTitleSuffixPattern.test(candidate)
    ) {
      continue;
    }
    return candidate
      .replace(/^(?:및|또는)\s+/, "")
      .replace(/^[가-힣]{1,4}[와과]\s+/, "")
      .trim();
  }

  return value;
}

function isSentenceFragmentStart(token: string) {
  return /(?:은|는|이|가|을|를|도|고도|므로|하지|하였으므로|아니하였으므로)$/.test(
    token,
  );
}

const lawTitleSuffixPattern =
  /(?:특례법|시행령|시행규칙|법률|법|령|규칙|조례|고시|훈령|예규|규정)$/;
