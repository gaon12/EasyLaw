export type JudgmentDocumentBlock =
  | {
      kind: "heading";
      level: 3 | 4 | 5;
      text: string;
    }
  | {
      kind: "paragraph";
      numbered: boolean;
      text: string;
    };

export type JudgmentDocumentSection = {
  id: string;
  kind: "meta" | "order" | "reason" | "default";
  title: string;
  blocks: JudgmentDocumentBlock[];
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

const implicitHeadings = [
  "판시사항",
  "판결요지",
  "청구취지",
  "참조조문",
  "참조판례",
  "주문",
  "이유",
] as const;

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
          blocks: splitBlocks(originalText),
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
    .replace(
      new RegExp(
        `(^|[\\n\\r]|[.!?。]\\s+)(${implicitHeadings.map(spacedHeadingPattern).join("|")})(?=\\s)`,
        "g",
      ),
      (_match, prefix: string, heading: string) =>
        `${prefix}\n§§${compactHeading(heading)}§§\n`,
    )
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
  const compact = compactHeading(heading);
  return headingAliases[compact] ?? heading.replace(/\s+/g, " ");
}

function compactHeading(heading: string) {
  return heading.replace(/\s+/g, "");
}

function spacedHeadingPattern(heading: string) {
  return heading.split("").join("\\s*");
}

function pushSection(
  sections: JudgmentDocumentSection[],
  section: MutableSection,
) {
  const blocks = linesToBlocks(section.lines, section.heading);
  if (blocks.length === 0 && sections.length > 0) {
    return;
  }

  const title = section.heading;
  sections.push({
    id: `section-${sections.length + 1}`,
    kind: sectionKind(title),
    title,
    blocks,
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

function linesToBlocks(
  lines: string[],
  sectionTitle?: string,
): JudgmentDocumentBlock[] {
  return lines
    .flatMap(splitInlineBlocks)
    .map((line) => lineToBlock(line, sectionTitle));
}

function splitBlocks(text: string): JudgmentDocumentBlock[] {
  return normalizeJudgmentText(text).map((line) => lineToBlock(line));
}

function lineToBlock(
  line: string,
  sectionTitle?: string,
): JudgmentDocumentBlock {
  const headingLevel =
    sectionTitle === "주문" || sectionTitle === "청구취지"
      ? null
      : headingLevelFromNumberedLine(line);
  if (headingLevel) {
    return {
      kind: "heading",
      level: headingLevel,
      text: line,
    };
  }

  return {
    kind: "paragraph",
    numbered: numberedLinePattern.test(line),
    text: line,
  };
}

function splitInlineBlocks(line: string) {
  const splitIndexes = inlineBlockSplitIndexes(line);
  if (splitIndexes.length === 0) {
    return [line];
  }

  const indexes = [0, ...splitIndexes, line.length];
  const blocks: string[] = [];
  for (let index = 0; index < indexes.length - 1; index += 1) {
    const text = line.slice(indexes[index], indexes[index + 1]).trim();
    if (text) {
      blocks.push(text);
    }
  }
  return blocks;
}

function inlineBlockSplitIndexes(line: string) {
  if (!numberedLinePattern.test(line)) {
    return [];
  }

  const indexes: number[] = [];
  const pattern =
    /\s(\d{1,2}\.\s+[가-힣A-Za-z]|[가-힣]\.\s+[가-힣A-Za-z]|\d{1,2}\)\s+[가-힣A-Za-z])/g;
  let match = pattern.exec(line);
  while (match) {
    const markerIndex = match.index + 1;
    const prefix = line.slice(0, markerIndex);
    if (isDateFragmentPrefix(prefix)) {
      match = pattern.exec(line);
      continue;
    }
    indexes.push(markerIndex);
    match = pattern.exec(line);
  }
  return indexes;
}

function isDateFragmentPrefix(prefix: string) {
  return /\d{4}\.\s+\d{1,2}\.\s*$/.test(prefix);
}

function headingLevelFromNumberedLine(line: string): 3 | 4 | 5 | null {
  if (!isShortHeadingLine(line)) {
    return null;
  }
  if (/^\d+\.\s+\S/.test(line)) {
    return 3;
  }
  if (/^[가-힣]\.\s+\S/.test(line)) {
    return 4;
  }
  if (/^\d+\)\s+\S/.test(line)) {
    return 5;
  }
  return null;
}

function isShortHeadingLine(line: string) {
  return line.length <= 44 && !/[。.!?]$/.test(line);
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
