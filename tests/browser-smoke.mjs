import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const port = Number(process.env.EASYLAW_E2E_PORT ?? 3210);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = join(tmpdir(), `easylaw-browser-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

const env = {
  ...process.env,
  EASYLAW_DATABASE_PATH: join(tempDir, "easylaw.sqlite"),
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
  }

  await browser.close();
} finally {
  stopDevServer();
  rmSync(tempDir, { force: true, recursive: true });
}
