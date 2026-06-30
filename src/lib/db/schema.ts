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
] as const;
