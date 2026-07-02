import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { path7z } from "7zip-bin-full";
import {
  type StreamArrayItem,
  streamArray,
} from "stream-json/streamers/stream-array.js";

const maxZipBytes = 300 * 1024 * 1024;
const maxUncompressedBytes = 2 * 1024 * 1024 * 1024;
const maxJsonFiles = 500;
const sevenZipThreads = Math.max(1, availableParallelism());

type JsonZipEntry = {
  path: string;
  size: number;
};

export async function processJsonZipEntries(
  input: {
    body?: URLSearchParams;
    method: "GET" | "POST";
    url: string;
  },
  onEntry: (entry: unknown, filename: string) => void,
) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "easylaw-dict-"));
  const archivePath = path.join(tempDir, "dictionary.zip");
  const entryPath = path.join(tempDir, "entry.json");
  try {
    await downloadZipToFile(input, archivePath);
    const entries = await listJsonEntries(archivePath);
    validateJsonEntries(entries);

    for (const entry of entries) {
      await extractJsonEntry(archivePath, entry.path, entryPath);
      await processJsonFile(entryPath, entry.path, onEntry);
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function downloadZipToFile(
  input: {
    body?: URLSearchParams;
    method: "GET" | "POST";
    url: string;
  },
  archivePath: string,
) {
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
  if (!response.body) {
    throw new Error("사전 ZIP 다운로드 응답이 비어 있습니다.");
  }

  const responseBody = response.body as Parameters<typeof Readable.fromWeb>[0];
  await pipeline(
    Readable.fromWeb(responseBody),
    createWriteStream(archivePath),
  );
  if ((await stat(archivePath)).size > maxZipBytes) {
    throw new Error("사전 ZIP 파일이 허용 크기를 초과했습니다.");
  }
}

async function listJsonEntries(archivePath: string) {
  const output = await run7z(["l", "-slt", archivePath]);
  const entries: JsonZipEntry[] = [];
  let currentPath: string | null = null;
  let currentSize = 0;

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("Path = ")) {
      if (currentPath?.toLowerCase().endsWith(".json")) {
        entries.push({ path: currentPath, size: currentSize });
      }
      currentPath = line.slice("Path = ".length);
      currentSize = 0;
      continue;
    }
    if (line.startsWith("Size = ")) {
      currentSize = Number.parseInt(line.slice("Size = ".length), 10) || 0;
    }
  }

  if (currentPath?.toLowerCase().endsWith(".json")) {
    entries.push({ path: currentPath, size: currentSize });
  }
  return entries;
}

function validateJsonEntries(entries: JsonZipEntry[]) {
  if (entries.length > maxJsonFiles) {
    throw new Error("JSON 파일 개수가 허용 범위를 초과했습니다.");
  }
  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (totalSize > maxUncompressedBytes) {
    throw new Error("압축 해제 데이터가 허용 크기를 초과했습니다.");
  }
}

async function extractJsonEntry(
  archivePath: string,
  entryName: string,
  outputPath: string,
) {
  await run7zToFile(
    ["x", "-so", `-mmt=${sevenZipThreads}`, archivePath, entryName],
    outputPath,
  );
}

async function processJsonFile(
  filePath: string,
  filename: string,
  onEntry: (entry: unknown, filename: string) => void,
) {
  if ((await firstJsonCharacter(filePath)) === "[") {
    await processJsonArrayFile(filePath, filename, onEntry);
    return;
  }

  const content = await readFile(filePath, "utf8");
  onEntry(JSON.parse(content), filename);
}

async function processJsonArrayFile(
  filePath: string,
  filename: string,
  onEntry: (entry: unknown, filename: string) => void,
) {
  const stream = createReadStream(filePath).pipe(
    streamArray.withParserAsStream(),
  );
  for await (const item of stream as AsyncIterable<StreamArrayItem>) {
    onEntry(item.value, filename);
  }
}

async function firstJsonCharacter(filePath: string) {
  const stream = createReadStream(filePath, {
    encoding: "utf8",
    highWaterMark: 4096,
  });

  try {
    for await (const chunk of stream) {
      const first = chunk.trimStart()[0];
      if (first) {
        return first;
      }
    }
  } finally {
    stream.destroy();
  }
  return "";
}

function run7z(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(path7z, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(format7zError(args, code, stderr)));
    });
  });
}

async function run7zToFile(args: string[], outputPath: string) {
  const child = spawn(path7z, args, { windowsHide: true });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exit = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(format7zError(args, code, stderr)));
    });
  });

  try {
    await pipeline(child.stdout, createWriteStream(outputPath));
    await exit;
  } catch (error) {
    child.kill();
    throw error;
  }
}

function format7zError(args: string[], code: number | null, stderr: string) {
  const message = stderr.trim() || "7z 실행 중 오류가 발생했습니다.";
  return `7z ${args[0]} failed with code ${code ?? "unknown"}: ${message}`;
}
