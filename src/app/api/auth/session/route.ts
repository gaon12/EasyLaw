import { authenticatedUser } from "@/app/api/auth/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await authenticatedUser();
  return Response.json({
    authenticated: Boolean(user),
  });
}
