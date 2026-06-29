import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { createOrAttachGenerationJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notifyRequest = z.object({
  email: z.string().email(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = notifyRequest.safeParse(await request.json());
  if (!body.success) {
    return Response.json(
      { error: "invalid_request", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDatabase();
  const judgment = db
    .prepare<[string], { id: string }>("SELECT id FROM judgments WHERE id = ?")
    .get(id);

  if (!judgment) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const jobId = createOrAttachGenerationJob(db, id, body.data.email);
  return Response.json({ ok: true, jobId });
}
