import type { Challenge, Payload } from "altcha/lib";
import { createChallenge, sha, verifySolution } from "altcha/lib";
import type { SqliteDatabase } from "./db";
import { newUrlToken } from "./security/crypto";
import { getSetting, setSetting } from "./settings";

export const CAPTCHA_LEVELS = ["off", "gentle", "standard", "strict"] as const;

export type CaptchaLevel = (typeof CAPTCHA_LEVELS)[number];

const secretSettingKey = "captcha_hmac_secret";
const levelSettingKey = "captcha_level";

const challengeCosts = {
  gentle: 80,
  standard: 180,
  strict: 360,
} satisfies Record<Exclude<CaptchaLevel, "off">, number>;

const testChallengeCosts = {
  gentle: 4,
  standard: 8,
  strict: 12,
} satisfies Record<Exclude<CaptchaLevel, "off">, number>;

export function getCaptchaLevel(db: SqliteDatabase): CaptchaLevel {
  const level = getSetting(db, levelSettingKey);
  return isCaptchaLevel(level) ? level : "standard";
}

export function isCaptchaEnabled(db: SqliteDatabase) {
  return getCaptchaLevel(db) !== "off";
}

export function shouldOfferCaptcha(db: SqliteDatabase, status: number) {
  return isCaptchaEnabled(db) && status === 429;
}

export async function createAltchaChallenge(db: SqliteDatabase) {
  const level = getCaptchaLevel(db);
  if (level === "off") {
    return null;
  }

  return createChallenge({
    algorithm: "SHA-256",
    cost: challengeCost(level),
    deriveKey: sha.deriveKey,
    expiresAt: new Date(Date.now() + 1000 * 60 * 10),
    hmacSignatureSecret: captchaSecret(db),
  });
}

export async function verifyAltchaPayload(
  db: SqliteDatabase,
  encodedPayload: string | undefined,
) {
  if (!encodedPayload || !isCaptchaEnabled(db)) {
    return false;
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) {
    return false;
  }

  const result = await verifySolution({
    challenge: payload.challenge,
    deriveKey: sha.deriveKey,
    hmacSignatureSecret: captchaSecret(db),
    solution: payload.solution,
  });

  return result.verified === true;
}

export function captchaRequiredResponse(setCookie?: string) {
  return Response.json(
    {
      challengeUrl: "/api/captcha/challenge",
      error: "captcha_required",
      message:
        "비회원 이용 한도에 가까워졌어요. 귀여운 보안 확인을 통과하면 이번 요청을 계속할 수 있어요.",
    },
    {
      headers: setCookie ? { "Set-Cookie": setCookie } : {},
      status: 403,
    },
  );
}

function captchaSecret(db: SqliteDatabase) {
  const existing = getSetting(db, secretSettingKey);
  if (existing) {
    return existing;
  }

  const generated = newUrlToken();
  setSetting(db, secretSettingKey, generated, true);
  return generated;
}

function challengeCost(level: Exclude<CaptchaLevel, "off">) {
  if (process.env.EASYLAW_TEST_MODE === "1") {
    return testChallengeCosts[level];
  }
  return challengeCosts[level];
}

function isCaptchaLevel(value: string | null): value is CaptchaLevel {
  return CAPTCHA_LEVELS.some((level) => level === value);
}

function parsePayload(encodedPayload: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64").toString("utf8"),
    ) as Partial<Payload>;
    if (
      !payload.challenge ||
      !payload.solution ||
      typeof payload.challenge !== "object" ||
      typeof payload.solution !== "object"
    ) {
      return null;
    }
    return payload as {
      challenge: Challenge;
      solution: NonNullable<Payload["solution"]>;
    };
  } catch {
    return null;
  }
}
