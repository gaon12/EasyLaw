import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";

const maxZipBytes = 300 * 1024 * 1024;
const maxUncompressedBytes = 700 * 1024 * 1024;
const maxJsonFiles = 200;

export async function downloadJsonZip(input: {
  body?: URLSearchParams;
  method: "GET" | "POST";
  tempPrefix: string;
  url: string;
}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), input.tempPrefix));
  const zipPath = path.join(tempDir, "dictionary.zip");
  try {
    const response = await fetch(input.url, {
      body: input.body,
      method: input.method,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`사전 다운로드 실패: ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maxZipBytes) {
      throw new Error("사전 ZIP 파일이 허용 크기를 초과했습니다.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxZipBytes) {
      throw new Error("사전 ZIP 파일이 허용 크기를 초과했습니다.");
    }

    await writeFile(zipPath, buffer);
    const zip = unzipSync(new Uint8Array(await readFile(zipPath)));
    return readJsonEntries(zip);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function readJsonEntries(zip: Record<string, Uint8Array>) {
  const entries: unknown[] = [];
  let totalBytes = 0;

  for (const [filename, content] of Object.entries(zip)) {
    if (!filename.toLowerCase().endsWith(".json")) {
      continue;
    }
    if (entries.length >= maxJsonFiles) {
      throw new Error("JSON 파일 개수가 허용 범위를 초과했습니다.");
    }
    totalBytes += content.byteLength;
    if (totalBytes > maxUncompressedBytes) {
      throw new Error("압축 해제 데이터가 허용 크기를 초과했습니다.");
    }
    entries.push(JSON.parse(Buffer.from(content).toString("utf8")));
  }

  return entries;
}
