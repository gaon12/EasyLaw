import type { Challenge, Payload } from "altcha/lib";
import { createChallenge, sha, verifySolution } from "altcha/lib";
import type { SqliteDatabase } from "./db";
import { logIntegrationEvent } from "./integration-events";
import { newUrlToken } from "./security/crypto";
import { getSetting, setSetting } from "./settings";

export const CAPTCHA_LEVELS = ["off", "gentle", "standard", "strict"] as const;
export const CAPTCHA_ALGORITHMS = [
  "SHA-256",
  "SHA-384",
  "SHA-512",
  "PBKDF2/SHA-256",
  "PBKDF2/SHA-384",
  "PBKDF2/SHA-512",
] as const;

export type CaptchaLevel = (typeof CAPTCHA_LEVELS)[number];
export type CaptchaAlgorithm = (typeof CAPTCHA_ALGORITHMS)[number];

const secretSettingKey = "captcha_hmac_secret";
const levelSettingKey = "captcha_level";
const algorithmSettingKey = "captcha_algorithm";
const costSettingKey = "captcha_cost";
const expiresMinutesSettingKey = "captcha_expires_minutes";
const minDurationSettingKey = "captcha_min_duration_ms";

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

export function getCaptchaSettings(db: SqliteDatabase) {
  const level = getCaptchaLevel(db);
  return {
    algorithm: getCaptchaAlgorithm(db),
    cost: challengeCost(db, level),
    expiresMinutes: numberSetting(db, expiresMinutesSettingKey, 10, 1, 60),
    level,
    minDurationMs: numberSetting(db, minDurationSettingKey, 650, 0, 3000),
  };
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
    logIntegrationEvent(db, {
      action: "challenge.create",
      message: "CAPTCHA가 꺼져 있어 challenge를 발급하지 않았습니다.",
      service: "captcha",
      status: "skipped",
    });
    return null;
  }

  const settings = getCaptchaSettings(db);
  const challenge = await createChallenge({
    algorithm: settings.algorithm,
    cost: settings.cost,
    deriveKey: sha.deriveKey,
    expiresAt: new Date(Date.now() + 1000 * 60 * settings.expiresMinutes),
    hmacSignatureSecret: captchaSecret(db),
  });
  logIntegrationEvent(db, {
    action: "challenge.create",
    message: "CAPTCHA challenge를 발급했습니다.",
    metadata: {
      algorithm: settings.algorithm,
      cost: settings.cost,
      expiresMinutes: settings.expiresMinutes,
      level: settings.level,
    },
    service: "captcha",
    status: "success",
  });
  return {
    ...challenge,
    configuration: {
      minDuration: settings.minDurationMs,
    },
  };
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

  const verified = result.verified === true;
  logIntegrationEvent(db, {
    action: "challenge.verify",
    message: verified
      ? "CAPTCHA 검증에 성공했습니다."
      : "CAPTCHA 검증에 실패했습니다.",
    service: "captcha",
    status: verified ? "success" : "failed",
  });
  return verified;
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

function challengeCost(db: SqliteDatabase, level: CaptchaLevel) {
  if (level === "off") {
    return 0;
  }
  const configured = numberSetting(
    db,
    costSettingKey,
    challengeCosts[level],
    1,
    200_000,
  );
  if (process.env.EASYLAW_TEST_MODE === "1") {
    return Math.min(configured, testChallengeCosts[level]);
  }
  return configured;
}

function isCaptchaLevel(value: string | null): value is CaptchaLevel {
  return CAPTCHA_LEVELS.some((level) => level === value);
}

function getCaptchaAlgorithm(db: SqliteDatabase): CaptchaAlgorithm {
  const algorithm = getSetting(db, algorithmSettingKey);
  return isCaptchaAlgorithm(algorithm) ? algorithm : "SHA-256";
}

export function isCaptchaAlgorithm(
  value: string | null,
): value is CaptchaAlgorithm {
  return CAPTCHA_ALGORITHMS.some((algorithm) => algorithm === value);
}

function numberSetting(
  db: SqliteDatabase,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number.parseInt(getSetting(db, key) ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
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
