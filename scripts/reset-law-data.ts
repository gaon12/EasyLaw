import { createDatabase } from "../src/lib/db";
import { resetLegalData } from "../src/lib/legal-data-maintenance";
import { databasePath } from "../src/lib/runtime-paths";

const db = createDatabase(databasePath());
try {
  const result = resetLegalData(db);
  console.log(JSON.stringify(result, null, 2));
} finally {
  db.close();
}
