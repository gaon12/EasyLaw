import { createDatabase } from "../src/lib/db";
import { runJudgmentCollection } from "../src/lib/judgment-collection";
import { resetLegalData } from "../src/lib/legal-data-maintenance";
import { databasePath } from "../src/lib/runtime-paths";

const args = new Set(process.argv.slice(2));
const shouldReset = args.has("--reset");
const forceRefresh = args.has("--force-refresh");

async function main() {
  const db = createDatabase(databasePath());
  try {
    if (shouldReset) {
      const reset = resetLegalData(db);
      console.log("Reset legal data:");
      console.log(JSON.stringify(reset, null, 2));
    }

    console.log("Starting law data collection...");
    const result = await runJudgmentCollection(db, {
      forceRefresh,
      trigger: "manual",
    });
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
