ALTER TABLE projects
  ADD COLUMN storage_provider ENUM('local','dropbox') NOT NULL DEFAULT 'local',
  ADD COLUMN storage_key VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN storage_synced_at DATETIME(3) NULL
