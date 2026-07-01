import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminMcpPage() {
  redirect("/admin/ai/mcp");
}
