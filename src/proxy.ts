import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";
import { isInstallationComplete } from "@/lib/setup";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const setupPath = pathname === "/setup" || pathname.startsWith("/api/setup/");
  const complete = isInstallationComplete(getDatabase());

  if (!complete && !setupPath) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "setup_required" },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (complete && setupPath) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "setup_complete" },
        {
          status: 410,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  const managementPath =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/org" ||
    pathname.startsWith("/org/") ||
    pathname === "/me" ||
    pathname.startsWith("/me/") ||
    pathname === "/research" ||
    pathname.startsWith("/research/") ||
    pathname === "/cp" ||
    pathname.startsWith("/cp/") ||
    pathname === "/api/research/stream" ||
    pathname.startsWith("/api/admin/");
  if (complete && managementPath) {
    const user = getSessionUser(
      getDatabase(),
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      loginUrl.searchParams.set("reason", "login_required");
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(loginUrl);
    }
    const adminPath =
      pathname.startsWith("/admin") || pathname.startsWith("/api/admin/");
    if (adminPath && !["admin", "super_admin"].includes(user.role)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      const forbiddenUrl = new URL("/forbidden", request.url);
      forbiddenUrl.searchParams.set(
        "from",
        `${pathname}${request.nextUrl.search}`,
      );
      forbiddenUrl.searchParams.set("reason", "admin_required");
      return NextResponse.redirect(forbiddenUrl);
    }
    if (adminPath && !user.totpEnabled) {
      const securityUrl = new URL("/security", request.url);
      securityUrl.searchParams.set(
        "next",
        `${pathname}${request.nextUrl.search}`,
      );
      securityUrl.searchParams.set("reason", "totp_required");
      return NextResponse.redirect(securityUrl);
    }
  }

  const response = NextResponse.next();
  if (setupPath) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|theme-init.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
