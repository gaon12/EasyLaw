import { z } from "zod";
import { createTotpEnrollment } from "@/lib/auth";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setupRequest = z.object({
  userId: z.string().min(1),
});

export async function POST(request: Request) {
  const body = setupRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const enrollment = await createTotpEnrollment(
    getDatabase(),
    body.data.userId,
  );
  return Response.json(enrollment);
}
