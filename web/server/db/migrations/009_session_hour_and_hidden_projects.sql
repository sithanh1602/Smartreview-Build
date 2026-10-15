-- Sessions become one access token valid for an hour from sign-in (no refresh token).
-- The refresh columns stay, nullable, so a backend still on the old code (refresh token) keeps
-- working on this shared database: its sessions fill them, the new code leaves them NULL.
-- Drop them in a later migration once every backend runs the new code.
-- hidden: the creator keeps a project out of other leaders' sight (docs/project-roles.md).
-- The ALTER statements cannot be repeated: after an interrupted run, finish them by hand and
-- add this file's row to schema_migrations.
ALTER TABLE auth_sessions
  MODIFY refresh_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  MODIFY refresh_expires_at DATETIME(3) NULL,
  ADD KEY idx_session_access_expiry (access_expires_at);

ALTER TABLE projects ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE projects_3d ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE
