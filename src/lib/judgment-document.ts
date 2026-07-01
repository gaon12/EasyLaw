export type JudgmentDocumentParagraph = {
  kind: "normal" | "numbered";
  text: string;
};

export type JudgmentDocumentSection = {
  id: string;
  kind: "meta" | "order" | "reason" | "default";
  title: string;
  paragraphs: JudgmentDocumentParagraph[];
};

const headingAliases: Record<string, string> = {
  주문: "주문",
  이유: "이유",
  청구취지: "청구취지",
  판시사항: "판시사항",
  판결요지: "판결요지",
  참조조문: "참조조문",
  참조판례: "참조판례",
};

export function parseJudgmentDocument(
  originalText: string,
): JudgmentDocumentSection[] {
  const lines = normalizeJudgmentText(originalText);
  const sections: JudgmentDocumentSection[] = [];
  let current: MutableSection | null = null;

  for (const line of lines) {
    const heading = headingFromLine(line);
    if (heading) {
      if (current) {
        pushSection(sections, current);
      }
      current = {
        heading: displayHeading(heading),
        lines: [],
      };
      continue;
    }

    if (!current) {
      current = { heading: "판결문", lines: [] };
    }
    current.lines.push(line);
  }

  if (current) {
    pushSection(sections, current);
  }

  return sections.length > 0
    ? sections
    : [
        {
          id: "section-1",
          kind: "default",
          title: "판결문",
          paragraphs: splitParagraphs(originalText),
        },
      ];
}

type MutableSection = {
  heading: string;
  lines: string[];
};

function normalizeJudgmentText(originalText: string) {
  return decodeHtmlEntities(originalText)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/【([^】]+)】/g, "\n§§$1§§\n")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function headingFromLine(line: string) {
  const match = /^§§(.+)§§$/.exec(line);
  return match?.[1].trim() ?? null;
}

function displayHeading(heading: string) {
  const compact = heading.replace(/\s+/g, "");
  return headingAliases[compact] ?? heading.replace(/\s+/g, " ");
}

function pushSection(
  sections: JudgmentDocumentSection[],
  section: MutableSection,
) {
  const paragraphs = linesToParagraphs(section.lines);
  if (paragraphs.length === 0 && sections.length > 0) {
    return;
  }

  const title = section.heading;
  sections.push({
    id: `section-${sections.length + 1}`,
    kind: sectionKind(title),
    title,
    paragraphs,
  });
}

function sectionKind(title: string): JudgmentDocumentSection["kind"] {
  if (title === "주문") {
    return "order";
  }
  if (title === "이유") {
    return "reason";
  }
  if (/원고|피고|상고인|피상고인|원심판결|변호사/.test(title)) {
    return "meta";
  }
  return "default";
}

function linesToParagraphs(lines: string[]): JudgmentDocumentParagraph[] {
  return lines.map((line) => ({
    kind: numberedLinePattern.test(line) ? "numbered" : "normal",
    text: line,
  }));
}

function splitParagraphs(text: string): JudgmentDocumentParagraph[] {
  return normalizeJudgmentText(text).map((line) => ({
    kind: numberedLinePattern.test(line) ? "numbered" : "normal",
    text: line,
  }));
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

const numberedLinePattern =
  /^((\d+|[가-힣]|[A-Z])\.|\d+\)|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/;
