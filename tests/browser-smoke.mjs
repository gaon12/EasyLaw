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

  await page.goto(baseUrl, { waitUntil: "networkidle" });
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

  const setupResponse = await page.request.get(`${baseUrl}/api/setup/status`);
  if (setupResponse.status() !== 410) {
    throw new Error("Setup API remained available after installation.");
  }

  const anonymousContext = await browser.newContext();
  const anonymousPage = await anonymousContext.newPage();
  await anonymousPage.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  if (new URL(anonymousPage.url()).pathname !== "/login") {
    throw new Error("Anonymous user could access the administration page.");
  }
  if (
    (
      await anonymousPage.request.post(`${baseUrl}/api/auth/totp/setup`)
    ).status() !== 401
  ) {
    throw new Error("Second-factor setup API accepted an anonymous request.");
  }
  await anonymousContext.close();

  await page.getByRole("heading", { level: 1, name: "EasyLaw" }).waitFor();
  await page.getByRole("region", { name: "EasyLaw 결과 예시" }).waitFor();
  await page.locator('form[action="/catalog"] input').waitFor();
  await page.locator('a[href="/login"]').first().waitFor();
  await page.locator('a[href="/signup"]').first().waitFor();
  if ((await page.getByText("공개 판결문", { exact: true }).count()) !== 0) {
    throw new Error(
      "Landing page still exposes the removed public catalog section.",
    );
  }
  if ((await page.getByText(/외부 API/).count()) !== 0) {
    throw new Error("Landing page still exposes implementation terminology.");
  }

  const themeToggle = page.getByRole("button", {
    name: "다크 모드로 전환",
  });
  await themeToggle.click();
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark") {
    throw new Error("Theme toggle did not apply dark mode.");
  }
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark") {
    throw new Error("Theme choice was not persisted.");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    )
  ) {
    throw new Error("Landing page has horizontal overflow on mobile.");
  }
  const navItems = page.locator("nav a");
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

  await page.setViewportSize({ width: 1440, height: 1100 });
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
