-- Sessions become one access token valid for an hour from sign-in (no refresh token). Sessions
-- made under the old rules are removed, so everyone signs in again once.
-- hidden: the creator keeps a project out of other leaders' sight (docs/project-roles.md).
-- The ALTER statements cannot be repeated: after an interrupted run, finish them by hand and
-- add this file's row to schema_migrations.
DELETE FROM auth_sessions;

ALTER TABLE auth_sessions
  DROP COLUMN refresh_hash,
  DROP COLUMN refresh_expires_at,
  ADD KEY idx_session_access_expiry (access_expires_at);

ALTER TABLE projects ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE projects_3d ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE
