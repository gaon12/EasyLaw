import { cookies } from "next/headers";
import { getDatabase } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

export async function authenticatedUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionUser(getDatabase(), token);
}
