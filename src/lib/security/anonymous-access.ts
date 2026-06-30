import type { NextRequest } from "next/server";
import type { SqliteDatabase } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { hashToken, newUrlToken } from "./crypto";
import { checkRateLimit } from "./rate-limit";

export const ANONYMOUS_COOKIE = "easylaw_anonymous_id";

const dayMs = 24 * 60 * 60 * 1000;
const minuteMs = 60 * 1000;
const lockMs = 60 * 1000;

type AnonymousLimitScope = "judgment_search" | "legal_research";

type AnonymousAccessOptions = {
  costly?: boolean;
  scope: AnonymousLimitScope;
};

type AnonymousAccessAllowed = {
  allowed: true;
  anonymousId: string;
  release: () => void;
  setCookie?: string;
};

type AnonymousAccessDenied = {
  allowed: false;
  error: "anonymous_limit_exceeded" | "anonymous_login_required";
  message: string;
  resetAt: string;
  setCookie?: string;
  status: 401 | 429;
};

type AnonymousAccessResult = AnonymousAccessAllowed | AnonymousAccessDenied;

export function checkAnonymousAccess(
  db: SqliteDatabase,
  request: NextRequest,
  options: AnonymousAccessOptions,
): AnonymousAccessResult {
  const user = getSessionUser(db, request.cookies.get(SESSION_COOKIE)?.value);
  if (user) {
    return {
      allowed: true,
      anonymousId: user.id,
      release() {},
    };
  }

  const cookieValue = request.cookies.get(ANONYMOUS_COOKIE)?.value;
  const anonymousId =
    cookieValue && cookieValue.length >= 20 ? cookieValue : newUrlToken();
  const setCookie = cookieValue
    ? undefined
    : `${ANONYMOUS_COOKIE}=${anonymousId}; Path=/; Max-Age=${60 * 60 * 24 * 180}; HttpOnly; SameSite=Lax`;

  const signals = requestSignals(request);
  const checks = [
    {
      key: `${options.scope}:anonymous:${hashToken(anonymousId)}`,
      limit: 3,
      windowMs: dayMs,
    },
    {
      key: `${options.scope}:ip:${hashToken(signals.ip)}`,
      limit: 10,
      windowMs: dayMs,
    },
    {
      key: `${options.scope}:ip-ua:${hashToken(`${signals.ip}|${signals.userAgent}`)}`,
      limit: 5,
      windowMs: dayMs,
    },
    {
      key: `${options.scope}:fingerprint:${hashToken(signals.fingerprint)}`,
      limit: 5,
      windowMs: dayMs,
    },
    {
      key: `${options.scope}:minute:${hashToken(`${signals.ipSubnet}|${anonymousId}`)}`,
      limit: 2,
      windowMs: minuteMs,
    },
  ];

  for (const check of checks) {
    const result = checkRateLimit(db, check.key, check.limit, check.windowMs);
    if (!result.allowed) {
      return {
        allowed: false,
        error: "anonymous_limit_exceeded",
        message:
          "비회원 이용 한도를 넘었어요. 잠시 후 다시 시도하거나 로그인해 주세요.",
        resetAt: result.resetAt,
        setCookie,
        status: 429,
      };
    }
  }

  if (options.costly) {
    const lockKey = `${options.scope}:concurrent:${hashToken(`${signals.ip}|${anonymousId}`)}`;
    const lock = checkRateLimit(db, lockKey, 1, lockMs);
    if (!lock.allowed) {
      return {
        allowed: false,
        error: "anonymous_login_required",
        message:
          "비회원 고비용 요청은 한 번에 하나만 처리할 수 있어요. 처리 중인 요청이 끝난 뒤 다시 시도해 주세요.",
        resetAt: lock.resetAt,
        setCookie,
        status: 401,
      };
    }

    return {
      allowed: true,
      anonymousId,
      release() {
        db.prepare("DELETE FROM rate_limits WHERE key = ?").run(lockKey);
      },
      setCookie,
    };
  }

  return {
    allowed: true,
    anonymousId,
    release() {},
    setCookie,
  };
}

export function anonymousLimitResponse(result: AnonymousAccessDenied) {
  return Response.json(
    {
      error: result.error,
      message: result.message,
      resetAt: result.resetAt,
    },
    {
      headers: result.setCookie ? { "Set-Cookie": result.setCookie } : {},
      status: result.status,
    },
  );
}

export function applyAnonymousCookie(
  response: Response,
  result: AnonymousAccessAllowed,
) {
  if (result.setCookie) {
    response.headers.append("Set-Cookie", result.setCookie);
  }
  return response;
}

function requestSignals(request: NextRequest) {
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const language = request.headers.get("accept-language") ?? "unknown";
  const timezone = request.headers.get("x-easylaw-timezone") ?? "unknown";
  const screen = request.headers.get("x-easylaw-screen") ?? "unknown";
  const platform = request.headers.get("sec-ch-ua-platform") ?? "unknown";
  return {
    fingerprint: [ipSubnet(ip), userAgent, language, timezone, screen, platform]
      .join("|")
      .slice(0, 1000),
    ip,
    ipSubnet: ipSubnet(ip),
    userAgent,
  };
}

function clientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function ipSubnet(ip: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split(".").slice(0, 3).join(".");
  }
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":");
  }
  return ip;
}
