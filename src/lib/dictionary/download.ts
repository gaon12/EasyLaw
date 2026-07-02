import { unzip } from "fflate";

const maxZipBytes = 300 * 1024 * 1024;
const maxUncompressedBytes = 2 * 1024 * 1024 * 1024;
const maxJsonFiles = 500;

export async function processJsonZipEntries(
  input: {
    body?: URLSearchParams;
    method: "GET" | "POST";
    url: string;
  },
  onEntry: (entry: unknown, filename: string) => void,
) {
  const zip = await downloadJsonZip(input);
  readJsonEntries(zip, onEntry);
}

async function downloadJsonZip(input: {
  body?: URLSearchParams;
  method: "GET" | "POST";
  url: string;
}) {
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

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > maxZipBytes) {
    throw new Error("사전 ZIP 파일이 허용 크기를 초과했습니다.");
  }

  return unzipJsonFiles(buffer);
}

function unzipJsonFiles(buffer: Uint8Array) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(
      buffer,
      {
        filter: (file) => file.name.toLowerCase().endsWith(".json"),
      },
      (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(data);
      },
    );
  });
}

function readJsonEntries(
  zip: Record<string, Uint8Array>,
  onEntry: (entry: unknown, filename: string) => void,
) {
  let jsonFileCount = 0;
  let totalBytes = 0;

  for (const [filename, content] of Object.entries(zip)) {
    if (!filename.toLowerCase().endsWith(".json")) {
      continue;
    }
    if (jsonFileCount >= maxJsonFiles) {
      throw new Error("JSON 파일 개수가 허용 범위를 초과했습니다.");
    }
    jsonFileCount += 1;
    totalBytes += content.byteLength;
    if (totalBytes > maxUncompressedBytes) {
      throw new Error("압축 해제 데이터가 허용 크기를 초과했습니다.");
    }
    onEntry(JSON.parse(Buffer.from(content).toString("utf8")), filename);
  }
}
