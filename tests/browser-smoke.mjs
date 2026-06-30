import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "otplib";
import { chromium } from "playwright";

const port = Number(process.env.EASYLAW_E2E_PORT ?? 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = join(tmpdir(), `easylaw-browser-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

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

function stopDevServer() {
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill();
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

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`${baseUrl}/setup`);
  if (new URL(page.url()).pathname !== "/setup") {
    throw new Error(
      "Unconfigured service did not redirect to the setup wizard.",
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
  await page.getByRole("link", { name: "최고 관리자" }).waitFor();
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
  if ((await page.locator('a[href="/login"]').count()) !== 0) {
    throw new Error("Installed administrator was not shown as signed in.");
  }
  const meResponse = await page.request.get(`${baseUrl}/me`);
  if (!meResponse.ok()) {
    throw new Error("Installed administrator could not access their account.");
  }

  const setupResponse = await page.request.get(`${baseUrl}/api/setup/status`);
  if (setupResponse.status() !== 410) {
    throw new Error("Setup API remained available after installation.");
  }

  await page.goto(`${baseUrl}/admin/captcha`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "CAPTCHA 설정" }).waitFor();
  await page.getByLabel("캡챠 수준").selectOption("strict");
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.getByText("설정을 저장했어요", { exact: false }).waitFor();
  if ((await page.getByText("CAPTCHA", { exact: true }).count()) === 0) {
    throw new Error(
      "Administration navigation did not expose CAPTCHA settings.",
    );
  }
  await page.goto(`${baseUrl}/admin/dictionary`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "용어 사전 관리" }).waitFor();
  await page.getByRole("button", { name: "표준국어대사전 업데이트" }).waitFor();

  const anonymousContext = await browser.newContext();
  const anonymousPage = await anonymousContext.newPage();
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
    .getByRole("heading", { name: "답변 초안" })
    .waitFor({ timeout: 15_000 });
  await page.getByRole("heading", { name: "근거 후보" }).waitFor();

  await page.goto(
    `${baseUrl}/catalog?q=${encodeURIComponent("서울중앙지방법원")}`,
    {
      waitUntil: "networkidle",
    },
  );
  await page.getByRole("heading", { name: "판결문 검색 결과" }).waitFor();
  if (
    (await page
      .getByRole("heading", { name: "판결문 이해 작업대" })
      .count()) !== 0
  ) {
    throw new Error("Catalog search results still showed the workspace first.");
  }

  await page.locator('a[href="/catalog"]').first().click();
  await page.locator("main article").first().waitFor();

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

  await browser.close();
} finally {
  stopDevServer();
  rmSync(tempDir, { force: true, recursive: true });
}
