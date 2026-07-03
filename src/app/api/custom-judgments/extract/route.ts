import { cookies } from "next/headers";
import { extractText, getDocumentProxy } from "unpdf";
import { getDatabase } from "@/lib/db";
import { CUSTOM_JUDGMENT_TEXT_MAX_LENGTH } from "@/lib/input-limits";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const db = getDatabase();
  const user = getSessionUser(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "invalid_request", message: "PDF 파일을 첨부해 주세요." },
      { status: 400 },
    );
  }
  if (file.size > MAX_PDF_BYTES) {
    return Response.json(
      {
        error: "file_too_large",
        message: "PDF는 15MB 이하만 처리할 수 있어요.",
      },
      { status: 413 },
    );
  }
  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return Response.json(
      { error: "invalid_file_type", message: "PDF 파일만 지원해요." },
      { status: 415 },
    );
  }

  try {
    const pdf = await getDocumentProxy(
      new Uint8Array(await file.arrayBuffer()),
    );
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const normalized = normalizeExtractedText(text);
    if (normalized.length < 20) {
      return Response.json(
        {
          error: "no_text_layer",
          message:
            "이 PDF에서 텍스트를 찾지 못했어요. 스캔 이미지 PDF는 지원하지 않으니 텍스트를 직접 붙여넣어 주세요.",
        },
        { status: 422 },
      );
    }
    const truncated = normalized.length > CUSTOM_JUDGMENT_TEXT_MAX_LENGTH;
    return Response.json({
      pages: totalPages,
      text: truncated
        ? normalized.slice(0, CUSTOM_JUDGMENT_TEXT_MAX_LENGTH)
        : normalized,
      truncated,
    });
  } catch {
    return Response.json(
      {
        error: "pdf_parse_failed",
        message:
          "PDF를 읽지 못했어요. 암호가 걸려 있거나 손상된 파일일 수 있어요.",
      },
      { status: 422 },
    );
  }
}

function normalizeExtractedText(text: string) {
  return text
    .replaceAll("\u00a0", " ")
    .split("\n")
    .map((line) => line.replaceAll(/[ \t]+/g, " ").trim())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}
