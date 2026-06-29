import { cookies } from "next/headers";
import { SETUP_COOKIE } from "@/lib/setup";

export async function setupSessionToken() {
  return (await cookies()).get(SETUP_COOKIE)?.value;
}

export function requestRateKey(request: Request) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
