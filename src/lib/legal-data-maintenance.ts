import type { SqliteDatabase } from "./db";

export type LegalDataResetResult = {
  deleted: Record<string, number>;
};

const collectionStateSettingKeys = [
  "judgment_collection_last_completed_at",
  "judgment_collection_last_failure_reason",
  "judgment_collection_last_imported_count",
  "judgment_collection_last_run_at",
  "judgment_collection_next_run_at",
  "judgment_collection_status",
] as const;

export function resetLegalData(db: SqliteDatabase): LegalDataResetResult {
  const deleted: Record<string, number> = {};
  const remove = (label: string, sql: string, params: unknown[] = []) => {
    const result = db.prepare(sql).run(...params);
    deleted[label] = result.changes;
  };

  const reset = db.transaction(() => {
    remove("feedback", "DELETE FROM feedback WHERE judgment_id IS NOT NULL");
    remove("notifications", "DELETE FROM notifications");
    remove("analysis_results", "DELETE FROM analysis_results");
    remove("judgment_generation_jobs", "DELETE FROM judgment_generation_jobs");
    remove("judgment_sources", "DELETE FROM judgment_sources");
    remove("judgment_texts", "DELETE FROM judgment_texts");
    remove("judgments", "DELETE FROM judgments");
    remove("external_api_cache", "DELETE FROM external_api_cache");
    remove("dictionary_terms", "DELETE FROM dictionary_terms");
    remove("dictionary_imports", "DELETE FROM dictionary_imports");
    remove("judgment_collection_runs", "DELETE FROM judgment_collection_runs");
    remove(
      "integration_events",
      `DELETE FROM integration_events
       WHERE service IN (
        'dictionary',
        'judgment-collection',
        'open-law',
        'open-law-constitutional',
        'open-law-law',
        'open-law-administrative-rule',
        'open-law-ordinance',
        'korean-law-mcp'
       )`,
    );
    remove(
      "collection_state_settings",
      `DELETE FROM service_settings
       WHERE key IN (${collectionStateSettingKeys.map(() => "?").join(", ")})`,
      [...collectionStateSettingKeys],
    );
  });

  reset();
  return { deleted };
}
