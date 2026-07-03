/**
 * 대용량 참조 데이터 전용 corpus DB(legal-corpus.sqlite) 마이그레이션.
 * 서비스 DB(easylaw.sqlite)의 migrations보다 먼저 적용된다.
 */
export const corpusMigrations = [
  {
    id: 1,
    name: "corpus_initial",
    sql: `
      CREATE TABLE IF NOT EXISTS corpus.judgment_texts (
        judgment_id TEXT PRIMARY KEY,
        original_text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS corpus.dictionary_terms (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        sense_no TEXT NOT NULL DEFAULT '',
        part_of_speech TEXT,
        definition TEXT NOT NULL,
        origin TEXT,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'standard',
        priority INTEGER NOT NULL DEFAULT 3
      );

      CREATE UNIQUE INDEX IF NOT EXISTS corpus.dictionary_terms_unique_idx
        ON dictionary_terms(source, word, sense_no, definition);

      CREATE INDEX IF NOT EXISTS corpus.dictionary_terms_word_idx
        ON dictionary_terms(word);

      CREATE INDEX IF NOT EXISTS corpus.dictionary_terms_source_priority_idx
        ON dictionary_terms(word, priority);

      CREATE TABLE IF NOT EXISTS corpus.dictionary_imports (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        source_url TEXT NOT NULL,
        imported_count INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        source TEXT NOT NULL DEFAULT 'standard'
      );

      CREATE TABLE IF NOT EXISTS corpus.external_api_cache (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        response_json TEXT NOT NULL,
        raw_hash TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        UNIQUE(provider, cache_key)
      );
    `,
  },
  {
    id: 2,
    name: "judgment_texts_full_text_search",
    // trigram 토크나이저는 형태소 분석 없이도 한국어 부분 문자열 검색을
    // 지원한다(질의 토큰 3자 이상). 3자 미만 토큰은 LIKE로 폴백한다.
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS corpus.judgment_texts_fts USING fts5(
        original_text,
        content='judgment_texts',
        content_rowid='rowid',
        tokenize='trigram'
      );

      INSERT INTO corpus.judgment_texts_fts(rowid, original_text)
        SELECT rowid, original_text FROM corpus.judgment_texts;

      CREATE TRIGGER IF NOT EXISTS corpus.judgment_texts_fts_ai
        AFTER INSERT ON judgment_texts BEGIN
          INSERT INTO judgment_texts_fts(rowid, original_text)
            VALUES (new.rowid, new.original_text);
        END;

      CREATE TRIGGER IF NOT EXISTS corpus.judgment_texts_fts_ad
        AFTER DELETE ON judgment_texts BEGIN
          INSERT INTO judgment_texts_fts(judgment_texts_fts, rowid, original_text)
            VALUES ('delete', old.rowid, old.original_text);
        END;

      CREATE TRIGGER IF NOT EXISTS corpus.judgment_texts_fts_au
        AFTER UPDATE ON judgment_texts BEGIN
          INSERT INTO judgment_texts_fts(judgment_texts_fts, rowid, original_text)
            VALUES ('delete', old.rowid, old.original_text);
          INSERT INTO judgment_texts_fts(rowid, original_text)
            VALUES (new.rowid, new.original_text);
        END;
    `,
  },
  {
    id: 3,
    name: "judgment_texts_word_search",
    // trigram은 3자 미만 질의를 다루지 못하므로 unicode61 단어 인덱스를
    // 병행한다. 한국어 조사는 단어 뒤에 붙어 접두("단어*") 매칭이 잘 맞는다.
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS corpus.judgment_words_fts USING fts5(
        original_text,
        content='judgment_texts',
        content_rowid='rowid',
        tokenize='unicode61'
      );

      INSERT INTO corpus.judgment_words_fts(rowid, original_text)
        SELECT rowid, original_text FROM corpus.judgment_texts;

      CREATE TRIGGER IF NOT EXISTS corpus.judgment_words_fts_ai
        AFTER INSERT ON judgment_texts BEGIN
          INSERT INTO judgment_words_fts(rowid, original_text)
            VALUES (new.rowid, new.original_text);
        END;

      CREATE TRIGGER IF NOT EXISTS corpus.judgment_words_fts_ad
        AFTER DELETE ON judgment_texts BEGIN
          INSERT INTO judgment_words_fts(judgment_words_fts, rowid, original_text)
            VALUES ('delete', old.rowid, old.original_text);
        END;

      CREATE TRIGGER IF NOT EXISTS corpus.judgment_words_fts_au
        AFTER UPDATE ON judgment_texts BEGIN
          INSERT INTO judgment_words_fts(judgment_words_fts, rowid, original_text)
            VALUES ('delete', old.rowid, old.original_text);
          INSERT INTO judgment_words_fts(rowid, original_text)
            VALUES (new.rowid, new.original_text);
        END;
    `,
  },
] as const;

export const migrations = [
  {
    id: 1,
    name: "initial_beta_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        totp_required INTEGER NOT NULL DEFAULT 0,
        totp_secret_ciphertext TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_auth_methods (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        identifier TEXT NOT NULL,
        verified_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, kind),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS magic_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_recovery_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        owner_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(owner_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS organization_members (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(organization_id, user_id),
        FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS judgments (
        id TEXT PRIMARY KEY,
        case_number TEXT NOT NULL,
        court_name TEXT NOT NULL,
        decided_on TEXT NOT NULL,
        title TEXT NOT NULL,
        case_type TEXT NOT NULL,
        status TEXT NOT NULL,
        visibility TEXT NOT NULL,
        source_provider TEXT NOT NULL,
        source_external_id TEXT NOT NULL,
        source_url TEXT,
        source_trust TEXT NOT NULL,
        original_text_hash TEXT,
        created_by_user_id TEXT,
        organization_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(source_provider, source_external_id),
        FOREIGN KEY(created_by_user_id) REFERENCES users(id),
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );

      CREATE INDEX IF NOT EXISTS judgments_public_status_idx
        ON judgments(visibility, status, decided_on);

      CREATE TABLE IF NOT EXISTS judgment_sources (
        id TEXT PRIMARY KEY,
        judgment_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        source_url TEXT,
        raw_hash TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        is_preferred INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(judgment_id) REFERENCES judgments(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS judgment_generation_jobs (
        id TEXT PRIMARY KEY,
        judgment_id TEXT NOT NULL,
        status TEXT NOT NULL,
        locked_at TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT,
        requested_by_email TEXT,
        prompt_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(judgment_id) REFERENCES judgments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS jobs_status_idx
        ON judgment_generation_jobs(status, created_at);

      CREATE TABLE IF NOT EXISTS analysis_results (
        id TEXT PRIMARY KEY,
        judgment_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        content_json TEXT NOT NULL,
        confidence_label TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        model_name TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(judgment_id) REFERENCES judgments(id) ON DELETE CASCADE,
        FOREIGN KEY(job_id) REFERENCES judgment_generation_jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS external_api_cache (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        response_json TEXT NOT NULL,
        raw_hash TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        UNIQUE(provider, cache_key)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        judgment_id TEXT NOT NULL,
        job_id TEXT,
        email TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        sent_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(judgment_id, email, type),
        FOREIGN KEY(judgment_id) REFERENCES judgments(id) ON DELETE CASCADE,
        FOREIGN KEY(job_id) REFERENCES judgment_generation_jobs(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        judgment_id TEXT,
        kind TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(judgment_id) REFERENCES judgments(id)
      );

      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        organization_id TEXT,
        event_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(organization_id) REFERENCES organizations(id)
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(actor_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS prompt_versions (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_start TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    id: 2,
    name: "secure_first_run_setup",
    sql: `
      CREATE TABLE IF NOT EXISTS service_settings (
        key TEXT PRIMARY KEY,
        value_ciphertext TEXT NOT NULL,
        is_secret INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS installation_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        setup_code_hash TEXT,
        setup_code_ciphertext TEXT,
        setup_code_expires_at TEXT,
        setup_session_hash TEXT,
        setup_session_expires_at TEXT,
        email_code_hash TEXT,
        email_code_expires_at TEXT,
        admin_user_id TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(admin_user_id) REFERENCES users(id)
      );

      DELETE FROM organization_members
        WHERE user_id IN ('user_admin', 'user_owner');
      DELETE FROM organizations
        WHERE id = 'org_legal_aid';
      DELETE FROM users
        WHERE (id = 'user_admin' AND email = 'admin@easylaw.local')
           OR (id = 'user_owner' AND email = 'owner@easylaw.local');
    `,
  },
  {
    id: 3,
    name: "user_sessions",
    sql: `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS user_sessions_user_idx
        ON user_sessions(user_id, expires_at);
    `,
  },
  {
    id: 4,
    name: "setup_email_delivery_test",
    sql: `
      ALTER TABLE installation_state
        ADD COLUMN email_test_fingerprint TEXT;
      ALTER TABLE installation_state
        ADD COLUMN email_tested_at TEXT;

      DELETE FROM service_settings WHERE key = 'base_url';
    `,
  },
  {
    id: 5,
    name: "custom_judgment_text",
    sql: `
      ALTER TABLE judgments
        ADD COLUMN original_text TEXT;
    `,
  },
  {
    id: 6,
    name: "standard_dictionary_terms",
    sql: `
      CREATE TABLE IF NOT EXISTS dictionary_terms (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        sense_no TEXT NOT NULL DEFAULT '',
        part_of_speech TEXT,
        definition TEXT NOT NULL,
        origin TEXT,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS dictionary_terms_unique_idx
        ON dictionary_terms(word, sense_no, definition);

      CREATE INDEX IF NOT EXISTS dictionary_terms_word_idx
        ON dictionary_terms(word);

      CREATE TABLE IF NOT EXISTS dictionary_imports (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        source_url TEXT NOT NULL,
        imported_count INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
    `,
  },
  {
    id: 7,
    name: "dictionary_source_priority",
    sql: `
      ALTER TABLE dictionary_terms
        ADD COLUMN source TEXT NOT NULL DEFAULT 'standard';
      ALTER TABLE dictionary_terms
        ADD COLUMN priority INTEGER NOT NULL DEFAULT 3;
      ALTER TABLE dictionary_imports
        ADD COLUMN source TEXT NOT NULL DEFAULT 'standard';

      DROP INDEX IF EXISTS dictionary_terms_unique_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS dictionary_terms_unique_idx
        ON dictionary_terms(source, word, sense_no, definition);

      CREATE INDEX IF NOT EXISTS dictionary_terms_source_priority_idx
        ON dictionary_terms(word, priority);
    `,
  },
  {
    id: 8,
    name: "integration_events",
    sql: `
      CREATE TABLE IF NOT EXISTS integration_events (
        id TEXT PRIMARY KEY,
        service TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS integration_events_service_created_idx
        ON integration_events(service, created_at);
    `,
  },
  {
    id: 9,
    name: "judgment_source_summary",
    sql: `
      ALTER TABLE judgments
        ADD COLUMN source_summary TEXT;
    `,
  },
  {
    id: 10,
    name: "login_challenges",
    sql: `
      CREATE TABLE IF NOT EXISTS login_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS login_challenges_user_idx
        ON login_challenges(user_id, expires_at);
    `,
  },
  {
    id: 11,
    name: "judgment_collection_runs",
    sql: `
      CREATE TABLE IF NOT EXISTS judgment_collection_runs (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        query TEXT NOT NULL,
        display INTEGER NOT NULL,
        imported_count INTEGER NOT NULL DEFAULT 0,
        created_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT,
        actor_user_id TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(actor_user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS judgment_collection_runs_started_idx
        ON judgment_collection_runs(started_at DESC);

      CREATE INDEX IF NOT EXISTS judgment_collection_runs_status_idx
        ON judgment_collection_runs(status, started_at);
    `,
  },
  {
    id: 12,
    name: "judgment_collection_progress",
    sql: `
      ALTER TABLE judgment_collection_runs
        ADD COLUMN progress_stage TEXT NOT NULL DEFAULT 'preparing';
      ALTER TABLE judgment_collection_runs
        ADD COLUMN progress_current INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE judgment_collection_runs
        ADD COLUMN progress_total INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE judgment_collection_runs
        ADD COLUMN progress_message TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    id: 13,
    name: "user_bookmarks",
    sql: `
      CREATE TABLE IF NOT EXISTS user_bookmarks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        judgment_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, judgment_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(judgment_id) REFERENCES judgments(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS user_bookmarks_user_created_idx
        ON user_bookmarks(user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS user_bookmarks_judgment_idx
        ON user_bookmarks(judgment_id);
    `,
  },
  {
    id: 14,
    name: "split_legal_corpus_database",
    sql: `
      INSERT INTO corpus.judgment_texts (judgment_id, original_text, updated_at)
        SELECT id, original_text, updated_at
        FROM main.judgments
        WHERE original_text IS NOT NULL AND TRIM(original_text) != ''
        ON CONFLICT(judgment_id) DO UPDATE SET
          original_text = excluded.original_text,
          updated_at = excluded.updated_at;

      INSERT OR IGNORE INTO corpus.dictionary_terms
        (id, word, sense_no, part_of_speech, definition, origin,
          raw_json, updated_at, source, priority)
        SELECT id, word, sense_no, part_of_speech, definition, origin,
          raw_json, updated_at, source, priority
        FROM main.dictionary_terms;

      INSERT OR IGNORE INTO corpus.dictionary_imports
        (id, status, source_url, imported_count, failure_reason,
          created_at, completed_at, source)
        SELECT id, status, source_url, imported_count, failure_reason,
          created_at, completed_at, source
        FROM main.dictionary_imports;

      DROP TABLE main.dictionary_terms;
      DROP TABLE main.dictionary_imports;
      DROP TABLE main.external_api_cache;
      ALTER TABLE judgments DROP COLUMN original_text;
    `,
  },
  {
    id: 15,
    name: "seed_easyread_prompt_version",
    sql: `
      INSERT INTO prompt_versions (id, version, description, is_active, created_at)
        SELECT 'prompt_easyread_v1', 'easyread-v1',
          'LLM 기반 Easy-Read 생성 기본 프롬프트', 0, datetime('now')
        WHERE NOT EXISTS (
          SELECT 1 FROM prompt_versions WHERE version = 'easyread-v1'
        );

      UPDATE prompt_versions
        SET is_active = 1
        WHERE version = 'easyread-v1'
          AND NOT EXISTS (
            SELECT 1 FROM prompt_versions WHERE is_active = 1
          );
    `,
  },
  {
    id: 16,
    name: "judgment_collection_resume_cursor",
    sql: `
      ALTER TABLE judgment_collection_runs
        ADD COLUMN cursor_target TEXT;
      ALTER TABLE judgment_collection_runs
        ADD COLUMN cursor_page INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE judgment_collection_runs
        ADD COLUMN last_progress_at TEXT;
    `,
  },
] as const;
