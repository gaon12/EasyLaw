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
    pathname.startsWith("/me/");
  if (complete && managementPath) {
    const user = getSessionUser(
      getDatabase(),
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (
      pathname.startsWith("/admin") &&
      !["admin", "super_admin"].includes(user.role)
    ) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (pathname.startsWith("/admin") && !user.totpEnabled) {
      return NextResponse.redirect(new URL("/security", request.url));
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
