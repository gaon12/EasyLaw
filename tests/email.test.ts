import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import {
  renderEmailTest,
  renderJudgmentReadyEmail,
  renderMagicLinkEmail,
  renderSetupVerificationEmail,
} from "../src/lib/email";

test("transactional emails include compatible HTML and plain text", () => {
  const emails = [
    renderEmailTest(),
    renderSetupVerificationEmail("123456"),
    renderJudgmentReadyEmail({
      caseNumber: "2023구합54112",
      title: "학교폭력 처분 취소 청구 사건",
    }),
  ];

  for (const email of emails) {
    assert.match(email.html, /<table role="presentation"/);
    assert.match(email.html, /style="/);
    assert.doesNotMatch(email.html, /<script|<img|<link|<style/i);
    assert.ok(email.text.length > 40);
    assert.doesNotMatch(email.text, /<[^>]+>/);
  }
});

test("magic link email includes a visible fallback URL", () => {
  const loginUrl = "https://easylaw.example/api/auth/magic-link/consume?t=abc";
  const email = renderMagicLinkEmail({ loginUrl });

  assert.match(email.html, /버튼이 열리지 않으면/);
  assert.match(
    email.html,
    /https:\/\/easylaw\.example\/api\/auth\/magic-link\/consume\?t=abc/,
  );
  assert.match(email.text, /EasyLaw 로그인: https:\/\/easylaw\.example/);
});

test("email HTML escapes dynamic values", () => {
  const email = renderJudgmentReadyEmail({
    caseNumber: "<script>alert(1)</script>",
    title: '손해배상 "테스트"',
  });

  assert.doesNotMatch(email.html, /<script>alert/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /&quot;테스트&quot;/);
});

test("verification email renders as a centered readable card", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 900 },
    });
    await page.setContent(renderSetupVerificationEmail("123456").html);

    const layout = await page.evaluate(() => {
      const heading = document.querySelector("h1");
      const code = [...document.querySelectorAll("div")].find(
        (element) => element.textContent === "123456",
      );
      const card = heading?.parentElement;
      return {
        bodyOverflow: document.documentElement.scrollWidth > innerWidth,
        cardWidth: card?.getBoundingClientRect().width ?? 0,
        heading: heading?.textContent,
        code: code?.textContent,
        codeColor: code ? getComputedStyle(code).color : "",
      };
    });

    assert.equal(layout.bodyOverflow, false);
    assert.ok(layout.cardWidth <= 600);
    assert.equal(layout.heading, "관리자 이메일을 확인해 주세요");
    assert.equal(layout.code, "123456");
    assert.equal(layout.codeColor, "rgb(0, 102, 255)");
  } finally {
    await browser.close();
  }
});
