import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { pageMetadata } from "@/lib/metadata";
import { getSetupStatus, isInstallationComplete } from "@/lib/setup";
import { setupSessionToken } from "../api/setup/_shared";
import { SetupWizard } from "./setup-wizard";

export const metadata = pageMetadata({
  title: "EasyLaw 설치",
  description: "EasyLaw 최초 실행 설정",
  robots: { index: false, follow: false },
});

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const db = getDatabase();
  if (isInstallationComplete(db)) {
    redirect("/");
  }

  const status = getSetupStatus(db, await setupSessionToken());
  return <SetupWizard initialStatus={status} />;
}
