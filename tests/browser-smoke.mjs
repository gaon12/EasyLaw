import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { generate } from "otplib";
import { chromium } from "playwright";

const port = Number(process.env.EASYLAW_E2E_PORT ?? 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const llmPort = port + 1;
const llmBaseUrl = `http://127.0.0.1:${llmPort}/v1`;
const mcpBaseUrl = `http://127.0.0.1:${llmPort}/mcp`;
const overviewAnswer = `## 핵심 답변

**손해 자료**를 먼저 정리해야 합니다. [E1]

- 이체 내역
- 상대방과의 대화 내용`;
const tempDir = join(tmpdir(), `easylaw-browser-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

const llmServer = createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    const payload = body ? JSON.parse(body) : {};
    if (request.url === "/mcp") {
      if (request.method === "GET") {
        response.writeHead(405);
        response.end();
        return;
      }
      if (request.method === "DELETE") {
        response.writeHead(200);
        response.end();
        return;
      }
      if (payload.method === "notifications/initialized") {
        response.writeHead(202);
        response.end();
        return;
      }
      const result =
        payload.method === "initialize"
          ? {
              capabilities: { tools: {} },
              protocolVersion: payload.params.protocolVersion,
              serverInfo: { name: "browser-mcp", version: "1.0.0" },
            }
          : payload.method === "tools/list"
            ? {
                tools: [
                  {
                    annotations: { readOnlyHint: true },
                    description: "법령과 판례를 검색합니다.",
                    inputSchema: {
                      properties: { query: { type: "string" } },
                      required: ["query"],
                      type: "object",
                    },
                    name: "search_law",
                    title: "법률 검색",
                  },
                ],
              }
            : {
                content: [
                  {
                    text: JSON.stringify({
                      results: [
                        {
                          source: "국가법령정보센터",
                          summary:
                            "손해배상 청구의 요건과 입증 자료를 설명합니다.",
                          title: "손해배상 관련 법령",
                          url: "https://example.test/law/damages",
                        },
                      ],
                    }),
                    type: "text",
                  },
                ],
                isError: false,
                structuredContent: {
                  results: [
                    {
                      source: "국가법령정보센터",
                      summary: "손해배상 청구의 요건과 입증 자료를 설명합니다.",
                      title: "손해배상 관련 법령",
                      url: "https://example.test/law/damages",
                    },
                  ],
                },
              };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: payload.id, jsonrpc: "2.0", result }));
      return;
    }
    const system = payload.messages?.[0]?.content ?? "";
    const context = JSON.parse(payload.messages?.[1]?.content ?? "{}");
    const content = system.includes("법률 검색 오버뷰 에이전트")
      ? context.evidence?.length
        ? JSON.stringify({
            answer: overviewAnswer,
            coverageLevel: 2,
            intent: "손해 발생 시 책임과 대응 절차 확인",
            mode: "overview",
            type: "answer",
          })
        : JSON.stringify({
            calls: [
              {
                arguments: { query: "손해배상" },
                toolKey: "korean-law/search_law",
              },
            ],
            coverageLevel: 2,
            intent: "손해 발생 시 책임과 대응 절차 확인",
            mode: "overview",
            type: "tool_calls",
          })
      : system.includes("법률 답변 검증자")
        ? JSON.stringify({
            answer: overviewAnswer,
            grounded: true,
            issues: [],
          })
        : context.section?.title === "핵심 결론"
          ? "## 핵심 답변\n\n**손해 자료**를 먼저 정리해야 합니다. [E1]"
          : "- 이체 내역\n- 상대방과의 대화 내용";
    if (payload.stream === true) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
      );
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((resolve) => {
  llmServer.listen(llmPort, "127.0.0.1", resolve);
});

const env = {
  ...process.env,
  EASYLAW_TEST_MODE: "1",
  EASYLAW_TEST_DATA_DIR: tempDir,
  EASYLAW_TEST_DATABASE_PATH: join(tempDir, "easylaw.sqlite"),
  EASYLAW_TEST_SETUP_CODE: "TEST-SETUP-01",
  EASYLAW_TEST_EMAIL_CODE: "123456",
  NEXT_TELEMETRY_DISABLED: "1",
};
const devArgs = [
  "run",
  "start",
  "--",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
];

const child =
  process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", `npm ${devArgs.join(" ")}`], {
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn("npm", devArgs, {
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

async function stopDevServer() {
  if (child.exitCode !== null) {
    return;
  }

  const closed = new Promise((resolve) => {
    child.once("close", resolve);
  });
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill();
  }
  await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  child.stdout.destroy();
  child.stderr.destroy();
  child.removeAllListeners();
  child.unref();
}

async function stopLlmServer() {
  if (!llmServer.listening) {
    return;
  }
  await new Promise((resolve, reject) => {
    llmServer.close((error) => (error ? reject(error) : resolve()));
  });
}

function cleanupTempDir() {
  try {
    rmSync(tempDir, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 200,
    });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : "";
    if (process.platform !== "win32" || !["EBUSY", "EPERM"].includes(code)) {
      throw error;
    }
    console.warn(`Browser test temp cleanup was deferred: ${tempDir}`);
  }
}

function seedBrowserJudgment(databasePath) {
  const db = new Database(databasePath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO judgments
        (id, case_number, court_name, decided_on, title, case_type, status,
         visibility, source_provider, source_external_id, source_url,
         source_trust, source_summary, original_text, created_at, updated_at)
       VALUES
        ('browser_judgment_1', '2024가단100', '서울중앙지방법원',
         '2024-02-20', '손해배상 청구 사건', 'civil', 'pending',
         'public', 'browser-fixture', 'browser-fixture-1',
         'https://example.test/judgment/browser-fixture',
         'external_verified', '손해배상 청구의 요건과 입증 자료를 다룬 판결입니다.',
         '원고는 손해배상을 청구하였고 법원은 손해 발생과 인과관계를 중심으로 판단하였습니다.',
         ?, ?)`,
    ).run(now, now);
  } finally {
    db.close();
  }
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Dev server did not become ready.\n${output}`);
}

const hydrationMessages = [];
const browserConsoleErrors = [];

function trackHydrationWarnings(page) {
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") {
      const location = message.location();
      if (!isExpectedMissingRoute(location.url)) {
        browserConsoleErrors.push(
          location.url ? `${text}\n${location.url}` : text,
        );
      }
    }
    if (
      (message.type() === "error" || message.type() === "warning") &&
      (text.includes("A tree hydrated") ||
        text.includes("Hydration failed") ||
        text.includes("server rendered HTML"))
    ) {
      hydrationMessages.push(text);
    }
  });
  page.on("pageerror", (error) => {
    browserConsoleErrors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() === 404 && !isExpectedMissingRoute(response.url())) {
      browserConsoleErrors.push(`404 response: ${response.url()}`);
    }
  });
}

function isExpectedMissingRoute(url) {
  return (
    url.includes("/missing-direct-page") || url.includes("/missing-from-home")
  );
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  trackHydrationWarnings(page);

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`${baseUrl}/setup`);
  if (new URL(page.url()).pathname !== "/setup") {
    throw new Error(
      "Unconfigured service did not redirect to the setup wizard.",
    );
  }
  const cdnResources = await page
    .locator(
      'head link[href*="cdn."], head link[href*="jsdelivr"], head script[src*="cdn."], head script[src*="jsdelivr"]',
    )
    .evaluateAll((elements) =>
      elements.map(
        (element) =>
          element.getAttribute("href") ?? element.getAttribute("src"),
      ),
    );
  if (cdnResources.length > 0) {
    throw new Error(
      `Page head loaded CDN resources: ${cdnResources.join(", ")}`,
    );
  }
  if ((await page.request.get(`${baseUrl}/api/judgments`)).status() !== 503) {
    throw new Error("Application API was available before setup completed.");
  }

  await page.getByLabel("설치 코드").fill("TEST-SETUP-01");
  await page.getByRole("button", { name: "계속" }).click();
  await page.getByLabel("관리자 이름").fill("최고 관리자");
  await page.getByLabel("관리자 이메일").fill("first@example.com");
  await page.getByLabel("Resend API 키").fill("re_browser_test");
  await page.getByLabel("보내는 이메일").fill("hello@example.com");
  const configureButton = page.getByRole("button", {
    name: "저장하고 인증 메일 보내기",
  });
  if (await configureButton.isEnabled()) {
    throw new Error("Setup continued before the email API test passed.");
  }
  const skipApiTest = page.getByTestId("skip-api-test");
  await skipApiTest.check();
  const checkmarkColor = await skipApiTest.evaluate(
    (checkbox) => getComputedStyle(checkbox, "::before").borderBottomColor,
  );
  if (checkmarkColor !== "rgb(255, 255, 255)") {
    throw new Error("Checked checkbox did not render a white checkmark.");
  }
  await skipApiTest.uncheck();
  await page.getByRole("button", { name: "API 키 테스트" }).click();
  await page.getByRole("button", { name: "테스트 통과" }).waitFor();
  await configureButton.click();

  await page.getByLabel("이메일 인증 코드").fill("123456");
  await page.getByRole("button", { name: "이메일 확인" }).click();

  const manualKey = page.locator("details code");
  await page.getByText("직접 입력 키 보기", { exact: true }).click();
  await manualKey.waitFor({ state: "visible" });
  const secret = (await manualKey.textContent())?.trim();
  if (!secret) {
    throw new Error("Authenticator secret was not available.");
  }
  await page.getByLabel("인증 앱 코드").fill(await generate({ secret }));
  await page.getByRole("button", { name: "설치 완료" }).click();
  await page
    .getByRole("heading", { name: "EasyLaw를 사용할 준비가 됐어요" })
    .waitFor();
  if ((await page.locator("code").count()) !== 10) {
    throw new Error("Setup did not issue ten recovery codes.");
  }
  await page.getByRole("link", { name: "EasyLaw 시작하기" }).click();
  await page.waitForURL(baseUrl);
  await page.getByRole("button", { name: "최고 관리자" }).waitFor();
  const faviconResponse = await page.request.get(`${baseUrl}/favicon.ico`);
  if (!faviconResponse.ok()) {
    throw new Error("Favicon was not served from /favicon.ico.");
  }
  const faviconType = faviconResponse.headers()["content-type"] ?? "";
  if (!faviconType.includes("image/")) {
    throw new Error("Favicon response did not use an image content type.");
  }
  const iconLinks = await page
    .locator('head link[rel~="icon"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
  if (!iconLinks.some((href) => href.includes("/favicon.ico"))) {
    throw new Error("Page head did not advertise the favicon.");
  }
  const appIconResponse = await page.request.get(`${baseUrl}/icon.png`);
  if (!appIconResponse.ok()) {
    throw new Error("Service logo app icon was not served from /icon.png.");
  }
  await page
    .getByRole("heading", {
      name: "최고 관리자님, 무엇을 이해해볼까요?",
    })
    .waitFor();
  await page.getByRole("button", { name: "최고 관리자" }).click();
  await page.getByRole("menuitem", { name: "내 문서함" }).waitFor();
  await page.getByRole("menuitem", { name: "계정 보안 설정" }).waitFor();
  await page.mouse.click(20, 20);
  if ((await page.getByRole("menuitem", { name: "로그아웃" }).count()) !== 0) {
    throw new Error("Account menu did not close after an outside click.");
  }
  if ((await page.locator('a[href="/login"]').count()) !== 0) {
    throw new Error("Installed administrator was not shown as signed in.");
  }
  const meResponse = await page.request.get(`${baseUrl}/me`);
  if (!meResponse.ok()) {
    throw new Error("Installed administrator could not access their account.");
  }
  await page.goto(`${baseUrl}/security`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "계정 보안 설정" }).waitFor();
  await page.getByText("first@example.com", { exact: true }).waitFor();
  await page.getByText("현재 권한은 2FA가 필수", { exact: false }).waitFor();
  if (
    (await page
      .getByRole("button", { exact: true, name: "2FA 끄기" })
      .count()) !== 0
  ) {
    throw new Error("Required administrator account could disable 2FA.");
  }
  await page.getByRole("button", { name: "복구 코드 재발급" }).click();
  await page
    .getByText("복구 코드를 새로 만들었어요", { exact: false })
    .waitFor();
  if ((await page.locator("main code").count()) !== 10) {
    throw new Error("Security center did not issue ten recovery codes.");
  }

  const setupResponse = await page.request.get(`${baseUrl}/api/setup/status`);
  if (setupResponse.status() !== 410) {
    throw new Error("Setup API remained available after installation.");
  }

  await page.goto(`${baseUrl}/admin/captcha`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "CAPTCHA 설정" }).waitFor();
  const activeAdminNav = page.locator(
    'nav a[aria-current="page"][href="/admin/captcha"]',
  );
  if ((await activeAdminNav.count()) !== 1) {
    throw new Error("Administration navigation did not highlight CAPTCHA.");
  }
  const activeAdminNavStyle = await activeAdminNav.evaluate((element) => {
    const style = getComputedStyle(element);
    const underline = getComputedStyle(element, "::after");
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      underlineBackground: underline.backgroundColor,
      underlineHeight: underline.height,
    };
  });
  if (
    activeAdminNavStyle.backgroundColor !== "rgba(0, 0, 0, 0)" ||
    activeAdminNavStyle.borderRadius !== "0px" ||
    activeAdminNavStyle.underlineBackground === "rgba(0, 0, 0, 0)" ||
    activeAdminNavStyle.underlineHeight !== "4px"
  ) {
    throw new Error(
      `Administration navigation did not render as underline tabs: ${JSON.stringify(activeAdminNavStyle)}`,
    );
  }
  await page.getByLabel("캡챠 수준").selectOption("strict");
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.getByText("설정을 저장했어요", { exact: false }).waitFor();
  if ((await page.getByText("CAPTCHA", { exact: true }).count()) === 0) {
    throw new Error(
      "Administration navigation did not expose CAPTCHA settings.",
    );
  }
  await page.goto(`${baseUrl}/admin/judgments/open-law`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "판결문 API 설정" }).waitFor();
  await page
    .getByRole("navigation", { name: "판결문 데이터 하위 메뉴" })
    .getByRole("link", { name: "API 설정" })
    .waitFor();
  if ((await page.getByLabel("OC 키").count()) !== 1) {
    throw new Error("Open Law administration page did not expose the OC key.");
  }
  if (
    (await page.locator('input[name="open_law_api_base_url"]').count()) !== 0
  ) {
    throw new Error(
      "Open Law administration page exposed an editable base URL.",
    );
  }
  await page.goto(`${baseUrl}/admin/dictionary`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "용어 사전 관리" }).waitFor();
  await page.getByRole("button", { name: "표준국어대사전 업데이트" }).waitFor();
  await page.getByRole("button", { name: "법령용어 업데이트" }).waitFor();
  const dictionaryAdminText = await page.locator("main").innerText();
  if (/GET ZIP|POST ZIP|JSON만|DB에/.test(dictionaryAdminText)) {
    throw new Error("Dictionary administration exposed import internals.");
  }
  if (
    !dictionaryAdminText.includes(
      "국가법령정보센터 법령용어를 가져와 로컬 사전에 반영합니다",
    )
  ) {
    throw new Error(
      "Dictionary administration did not explain the update clearly.",
    );
  }

  await page.goto(`${baseUrl}/admin/ai`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "AI 설정" }).waitFor();
  const aiSubNav = page.getByRole("navigation", {
    name: "AI 설정 하위 메뉴",
  });
  await aiSubNav.getByRole("link", { name: "모델 API" }).click();
  await page.waitForURL(`${baseUrl}/admin/ai/llm`);
  await page.getByRole("heading", { name: "모델 API" }).waitFor();
  await page.getByLabel("프리셋").selectOption("google");
  if (
    (await page.getByLabel("API Base URL").inputValue()) !==
    "https://generativelanguage.googleapis.com/v1beta/openai"
  ) {
    throw new Error("LLM API preset did not update the base URL.");
  }
  if ((await page.getByLabel("모델").inputValue()) !== "gemini-3.5-flash") {
    throw new Error("LLM API preset did not update the model.");
  }
  await page.getByLabel("공급자").fill("Test LLM");
  await page.getByLabel("API Base URL").fill(llmBaseUrl);
  await page.getByLabel("모델").fill("test-model");
  await page.getByLabel("API Key").fill("browser-test-key");
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.getByText("설정을 저장했어요", { exact: false }).waitFor();
  await aiSubNav.getByRole("link", { name: "도구 연결" }).click();
  await page.waitForURL(`${baseUrl}/admin/ai/mcp`);
  await page.getByRole("heading", { name: "도구 연결" }).waitFor();
  await page.getByLabel("korean-law-mcp").fill(mcpBaseUrl);
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.getByText("설정을 저장했어요", { exact: false }).waitFor();

  await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  if (
    (await page.getByRole("heading", { name: "판결문 수집" }).count()) !== 0
  ) {
    throw new Error("Administration overview exposed judgment collection.");
  }
  await page.locator('nav a[aria-current="page"][href="/admin"]').waitFor();
  if ((await page.locator('main a[href="/admin/llm"]').count()) !== 0) {
    throw new Error(
      "Administration overview still exposed duplicate action buttons.",
    );
  }
  await page.goto(`${baseUrl}/admin/judgments/collection`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "법률 데이터 자동 수집" }).waitFor();
  if ((await page.getByLabel("검색어").count()) !== 0) {
    throw new Error("Judgment collection still exposed a search query field.");
  }
  await page.getByText("판례·헌재·법령·행정규칙·자치법규 증분 수집").waitFor();
  if ((await page.getByLabel("한 번에 가져올 건수").count()) !== 0) {
    throw new Error("Judgment collection still exposed a per-run limit.");
  }
  await page.getByRole("button", { name: "지금 수집" }).click();
  const collectionDialog = page.locator(
    '[role="dialog"][aria-labelledby="judgment-collection-progress-title"]',
  );
  await collectionDialog.waitFor();
  await collectionDialog.getByRole("progressbar").waitFor();
  const closeCollectionDialog = collectionDialog.getByRole("button", {
    name: "닫기",
  });
  await closeCollectionDialog.waitFor({ timeout: 30000 });
  await closeCollectionDialog.click();
  if (
    (await page
      .locator('nav a[aria-current="page"][href="/admin/judgments"]')
      .count()) !== 1
  ) {
    throw new Error("Judgment collection navigation was not active.");
  }
  if (
    (await page
      .locator(
        'nav[aria-label="판결문 데이터 하위 메뉴"] a[aria-current="page"][href="/admin/judgments/collection"]',
      )
      .count()) !== 1
  ) {
    throw new Error("Judgment collection subnavigation was not active.");
  }
  seedBrowserJudgment(env.EASYLAW_TEST_DATABASE_PATH);

  const loginChallengeContext = await browser.newContext();
  const loginChallengePage = await loginChallengeContext.newPage();
  trackHydrationWarnings(loginChallengePage);
  const magicToken = randomBytes(32).toString("base64url");
  const masterKey = Buffer.from(
    readFileSync(join(tempDir, ".master-key"), "utf8").trim(),
    "base64url",
  );
  const magicTokenHash = createHmac(
    "sha256",
    createHash("sha256").update(masterKey).update("easylaw:hmac:v1").digest(),
  )
    .update(magicToken)
    .digest("hex");
  const browserDb = new Database(env.EASYLAW_TEST_DATABASE_PATH);
  const adminUser = browserDb
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("first@example.com");
  if (!adminUser) {
    throw new Error("Setup administrator was not available for 2FA login.");
  }
  const now = new Date();
  browserDb
    .prepare(
      `INSERT INTO magic_links
        (id, user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      `magic_${randomUUID()}`,
      adminUser.id,
      magicTokenHash,
      new Date(now.getTime() + 15 * 60_000).toISOString(),
      now.toISOString(),
    );
  browserDb.close();

  await loginChallengePage.goto(
    `${baseUrl}/api/auth/magic-link/consume?token=${encodeURIComponent(magicToken)}&next=%2Fadmin`,
    { waitUntil: "networkidle" },
  );
  await loginChallengePage.waitForURL("**/login/2fa**");
  const loginChallengeUrl = new URL(loginChallengePage.url());
  if (
    loginChallengeUrl.origin !== baseUrl ||
    loginChallengeUrl.pathname !== "/login/2fa" ||
    loginChallengeUrl.searchParams.get("next") !== "/admin"
  ) {
    throw new Error(
      `2FA login challenge used an unexpected URL: ${loginChallengeUrl}`,
    );
  }
  await loginChallengePage
    .getByRole("heading", { name: "2차 인증(2FA)" })
    .waitFor();
  const preTotpSession = await loginChallengePage.request.get(
    `${baseUrl}/api/auth/session`,
  );
  if ((await preTotpSession.json()).authenticated !== false) {
    throw new Error("Email verification created a session before 2FA.");
  }
  const browserLoginCode = await generate({ secret });
  await loginChallengePage.getByLabel("인증 앱 코드").fill(browserLoginCode);
  await loginChallengePage
    .getByRole("button", { name: "2FA 인증하고 로그인" })
    .click();
  await loginChallengePage.waitForURL(`${baseUrl}/admin`);
  const postTotpSession = await loginChallengePage.request.get(
    `${baseUrl}/api/auth/session`,
  );
  if ((await postTotpSession.json()).authenticated !== true) {
    throw new Error("Valid 2FA did not create a login session.");
  }
  if (
    (
      await loginChallengePage.request.post(`${baseUrl}/api/auth/login/totp`, {
        data: { code: await generate({ secret }) },
      })
    ).status() !== 401
  ) {
    throw new Error("Consumed 2FA login challenge could be reused.");
  }
  await loginChallengeContext.close();

  const anonymousContext = await browser.newContext();
  const anonymousPage = await anonymousContext.newPage();
  trackHydrationWarnings(anonymousPage);
  await anonymousPage.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  if (new URL(anonymousPage.url()).pathname !== "/login") {
    throw new Error("Anonymous user could access the administration page.");
  }
  await anonymousPage
    .getByText("로그인이 필요한 페이지예요", { exact: false })
    .waitFor();
  if (
    (
      await anonymousPage.request.post(`${baseUrl}/api/auth/totp/setup`)
    ).status() !== 401
  ) {
    throw new Error("Second-factor setup API accepted an anonymous request.");
  }

  await anonymousPage.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await anonymousPage.getByLabel("이메일").fill("browser-login@example.com");
  await anonymousPage
    .getByRole("button", { name: "이메일로 인증하기" })
    .click();
  await anonymousPage
    .getByRole("dialog", { name: "메일을 보냈어요" })
    .waitFor();
  await anonymousPage
    .getByText("인증 링크를 이메일로 보냈어요", { exact: false })
    .waitFor();
  if (
    (await anonymousPage
      .locator("form")
      .getByText("인증 링크를 이메일로 보냈어요", { exact: false })
      .count()) !== 0
  ) {
    throw new Error("Login form still shows the mail notice below the form.");
  }
  await anonymousPage.getByRole("button", { name: "확인" }).click();
  if (
    (await anonymousPage
      .getByRole("link", { name: "개발용 로그인 링크 열기" })
      .count()) !== 0
  ) {
    throw new Error("Login page exposed a developer-only magic link.");
  }

  await anonymousPage.goto(baseUrl, { waitUntil: "networkidle" });
  await anonymousPage
    .getByRole("heading", { level: 1, name: "EasyLaw" })
    .waitFor();
  if ((await anonymousPage.title()) !== "판결문을 이해하기 쉽게 | EasyLaw") {
    throw new Error("Root document title did not include the service name.");
  }
  await anonymousPage
    .getByRole("region", { name: "EasyLaw 결과 예시" })
    .waitFor();
  await anonymousPage.getByLabel("판결문 검색").waitFor();
  if (
    (await anonymousPage.getByRole("link", { name: "판결문 찾기" }).count()) !==
    0
  ) {
    throw new Error("Anonymous landing page still exposes the catalog CTA.");
  }
  if (
    (await anonymousPage
      .getByRole("link", { name: "내 문서로 시작하기" })
      .count()) !== 0
  ) {
    throw new Error("Anonymous landing page still exposes the document CTA.");
  }
  if (
    (await anonymousPage.getByText("관리센터", { exact: true }).count()) !== 0
  ) {
    throw new Error("Anonymous landing page exposed the management center.");
  }
  if (
    (await anonymousPage
      .getByText("판결문 이해 보조 서비스", { exact: true })
      .count()) !== 0
  ) {
    throw new Error("Removed hero eyebrow is still visible.");
  }
  const questionMode = anonymousPage.getByRole("switch", {
    name: "법률 질문 모드",
  });
  await questionMode.click();
  await anonymousPage.getByLabel("법률 상황 질문").waitFor();
  await anonymousPage
    .getByText("이런 질문을 할 수 있어요", { exact: true })
    .waitFor();
  await anonymousPage.getByRole("button", { name: "질문" }).waitFor();
  const exampleQuestion = "전세보증금을 못 받고 있어요.";
  await anonymousPage.getByRole("button", { name: exampleQuestion }).click();
  if (
    (await anonymousPage.getByLabel("법률 상황 질문").inputValue()) !==
    exampleQuestion
  ) {
    throw new Error(
      "Example question did not populate the natural-language input.",
    );
  }
  if (
    (await anonymousPage.getByText("공개 판결문", { exact: true }).count()) !==
    0
  ) {
    throw new Error(
      "Landing page still exposes the removed public catalog section.",
    );
  }
  if ((await anonymousPage.getByText(/외부 API/).count()) !== 0) {
    throw new Error("Landing page still exposes implementation terminology.");
  }

  await anonymousPage.goto(`${baseUrl}/research`, { waitUntil: "networkidle" });
  await anonymousPage.getByRole("heading", { name: "AI 법률 질문" }).waitFor();

  await anonymousPage.goto(`${baseUrl}/guide`, { waitUntil: "networkidle" });
  await anonymousPage
    .getByRole("heading", { name: "쉬운 판결문 위키" })
    .waitFor();
  if (
    (await anonymousPage
      .locator('nav a[aria-current="page"][href="/guide"]')
      .count()) !== 1
  ) {
    throw new Error("Service navigation did not highlight the current page.");
  }
  await anonymousPage.getByRole("heading", { name: "대문" }).waitFor();
  await anonymousPage.getByLabel("위키 분류").waitFor();
  await anonymousPage.getByLabel("최근 변경").waitFor();

  const directErrorContext = await browser.newContext();
  const directErrorPage = await directErrorContext.newPage();
  await directErrorPage.goto(`${baseUrl}/missing-direct-page`, {
    waitUntil: "networkidle",
  });
  await directErrorPage.getByRole("link", { name: "홈으로 이동" }).waitFor();
  if (
    (await directErrorPage
      .getByRole("button", { name: "뒤로 돌아가기" })
      .count()) !== 0
  ) {
    throw new Error("Direct error page showed a back button without history.");
  }
  await directErrorContext.close();

  await anonymousPage.goto(baseUrl, { waitUntil: "networkidle" });
  await anonymousPage.evaluate(() => {
    const link = document.createElement("a");
    link.href = "/missing-from-home";
    link.textContent = "missing";
    document.body.append(link);
    link.click();
  });
  await anonymousPage.getByRole("button", { name: "뒤로 돌아가기" }).waitFor();
  await anonymousPage.getByRole("button", { name: "뒤로 돌아가기" }).click();
  await anonymousPage.waitForURL(baseUrl);

  const themeToggle = anonymousPage.getByRole("button", {
    name: "다크 모드로 전환",
  });
  await themeToggle.click();
  if (
    (await anonymousPage.locator("html").getAttribute("data-theme")) !== "dark"
  ) {
    throw new Error("Theme toggle did not apply dark mode.");
  }
  await anonymousPage.reload({ waitUntil: "networkidle" });
  if (
    (await anonymousPage.locator("html").getAttribute("data-theme")) !== "dark"
  ) {
    throw new Error("Theme choice was not persisted.");
  }

  await anonymousPage
    .getByLabel("언어와 글자 크기 설정", { exact: true })
    .click();
  const languageOptions = await anonymousPage
    .getByLabel("언어", { exact: true })
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => option.textContent?.trim()),
    );
  if (languageOptions.join("|") !== "한국어|English|日本語") {
    throw new Error("Language options did not use readable labels.");
  }
  await anonymousPage.getByLabel("언어", { exact: true }).selectOption("en");
  if (
    (await anonymousPage.title()) !== "Understand Judgments Clearly | EasyLaw"
  ) {
    throw new Error("Locale change did not update the document title.");
  }
  await anonymousPage
    .getByRole("button", { exact: true, name: "크게" })
    .click();
  if (
    (await anonymousPage.locator("html").getAttribute("data-text-size")) !==
    "large"
  ) {
    throw new Error("Text size preference was not applied.");
  }
  const bodyZoom = await anonymousPage.evaluate(
    () => getComputedStyle(document.body).zoom,
  );
  if (Number.parseFloat(bodyZoom) <= 1) {
    throw new Error("Text size preference did not scale the page.");
  }
  await anonymousPage
    .getByLabel("언어와 글자 크기 설정", { exact: true })
    .click();
  await anonymousPage.mouse.click(20, 20);
  if ((await anonymousPage.getByLabel("언어", { exact: true }).count()) !== 0) {
    throw new Error("Reading preferences did not close after outside click.");
  }

  await anonymousPage.setViewportSize({ width: 390, height: 844 });
  if (
    await anonymousPage.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    )
  ) {
    throw new Error("Landing page has horizontal overflow on mobile.");
  }
  const navItems = anonymousPage.locator("nav a");
  for (let index = 0; index < (await navItems.count()); index += 1) {
    const lineHeight = await navItems.nth(index).evaluate((item) => {
      const style = getComputedStyle(item);
      return {
        height: item.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });
    if (lineHeight.height > lineHeight.lineHeight * 1.5) {
      throw new Error("A mobile navigation item wrapped onto multiple lines.");
    }
  }
  await anonymousContext.close();

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(
    `${baseUrl}/research?q=${encodeURIComponent(exampleQuestion)}`,
    {
      waitUntil: "networkidle",
    },
  );
  await page.getByRole("heading", { name: "AI 법률 질문" }).waitFor();
  await page
    .getByRole("heading", { name: "AI 답변" })
    .waitFor({ timeout: 15_000 });
  await page.getByRole("heading", { name: "핵심 답변" }).waitFor();
  await page.getByText("손해 자료", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "출처" }).waitFor();
  const citationButton = page.locator('button[aria-label^="E1 근거:"]');
  await citationButton.hover();
  await page.getByRole("tooltip").waitFor();
  await citationButton.click();
  const citationDialog = page.getByRole("dialog");
  await citationDialog.waitFor();
  const originalSourceLink = citationDialog.getByRole("link", {
    name: "원문 보기",
  });
  if (!(await originalSourceLink.getAttribute("href"))) {
    throw new Error("Research citation did not link to its original source.");
  }
  await citationDialog.getByRole("button", { name: "근거 상세 닫기" }).click();
  if ((await page.getByText(/^모델 /).count()) !== 0) {
    throw new Error("Research overview exposed the internal model name.");
  }

  await page.goto(`${baseUrl}/catalog?q=${encodeURIComponent("서울")}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "판결문 검색 결과" }).waitFor();
  await page.getByRole("button", { name: "이전" }).waitFor();
  await page.getByRole("button", { name: "다음" }).waitFor();
  if (
    (await page
      .getByRole("heading", { exact: true, name: "판결문 검색" })
      .count()) !== 0
  ) {
    throw new Error("Catalog search results still showed the workspace first.");
  }

  await page.locator('a[href="/catalog"]').first().click();
  await page.locator("main article").first().waitFor();
  await page.locator('main article a[href^="/p/"]').first().click();
  await page.getByRole("heading", { name: "판결문 본문" }).waitFor();
  const publicJudgmentText = await page.locator("main").innerText();
  if (/공개 출처|원문 출처/.test(publicJudgmentText)) {
    throw new Error("Public judgment detail exposed public source text.");
  }

  for (const path of ["/login", "/signup", "/admin", "/org", "/me"]) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
    await page.locator("main").waitFor();

    if (path === "/login" || path === "/signup") {
      if ((await page.getByText(/TOTP|매직링크|매직 링크/).count()) !== 0) {
        throw new Error(`${path} exposes implementation-specific auth terms.`);
      }

      const footerLayout = await page.evaluate(() => {
        const footer = document.querySelector("footer");
        if (!footer) {
          return null;
        }

        return {
          documentHeight: document.documentElement.scrollHeight,
          footerBottom: footer.getBoundingClientRect().bottom + window.scrollY,
        };
      });

      if (
        !footerLayout ||
        Math.abs(footerLayout.documentHeight - footerLayout.footerBottom) > 1
      ) {
        throw new Error(`${path} leaves space below the footer.`);
      }
    }
  }

  if (hydrationMessages.length > 0) {
    throw new Error(`Hydration warning was logged:\n${hydrationMessages[0]}`);
  }
  if (browserConsoleErrors.length > 0) {
    throw new Error(
      `Browser console error was logged:\n${browserConsoleErrors[0]}`,
    );
  }

  await browser.close();
} finally {
  await stopDevServer();
  await stopLlmServer();
  cleanupTempDir();
}
