import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { getSetupStatus, isInstallationComplete } from "@/lib/setup";
import { setupSessionToken } from "../api/setup/_shared";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = {
  title: "EasyLaw 설치",
  description: "EasyLaw 최초 실행 설정",
};

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const db = getDatabase();
  if (isInstallationComplete(db)) {
    redirect("/");
  }

  const status = getSetupStatus(db, await setupSessionToken());
  return <SetupWizard initialStatus={status} />;
}
