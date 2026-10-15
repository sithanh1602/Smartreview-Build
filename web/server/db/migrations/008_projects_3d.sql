-- 3D projects keep their own copies of the project tables. Only users is shared with 2D.
-- CREATE TABLE LIKE copies columns, indexes and checks but not foreign keys, so those are
-- added below and point at the 3D tables. Nothing is copied from or changed in the 2D tables.
-- The ALTER statements cannot be repeated: after an interrupted run, finish them by hand and
-- add this file's row to schema_migrations.
CREATE TABLE IF NOT EXISTS dataset_revisions_3d LIKE dataset_revisions;
CREATE TABLE IF NOT EXISTS projects_3d LIKE projects;
CREATE TABLE IF NOT EXISTS risk_cases_3d LIKE risk_cases;
CREATE TABLE IF NOT EXISTS review_decisions_3d LIKE review_decisions;
CREATE TABLE IF NOT EXISTS frame_reviews_3d LIKE frame_reviews;
CREATE TABLE IF NOT EXISTS project_members_3d LIKE project_members;
CREATE TABLE IF NOT EXISTS project_invites_3d LIKE project_invites;
CREATE TABLE IF NOT EXISTS project_handoffs_3d LIKE project_handoffs;

ALTER TABLE projects_3d
  ALTER COLUMN storage_provider SET DEFAULT 'dropbox',
  ADD CONSTRAINT project_3d_revision_fk
    FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions_3d(id);

ALTER TABLE risk_cases_3d
  ADD CONSTRAINT case_3d_dataset_fk
    FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions_3d(id);

ALTER TABLE review_decisions_3d
  ADD CONSTRAINT review_3d_case_fk
    FOREIGN KEY (risk_case_id) REFERENCES risk_cases_3d(id);

ALTER TABLE frame_reviews_3d
  ADD CONSTRAINT frame_review_3d_revision_fk
    FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions_3d(id)
    ON DELETE CASCADE;

ALTER TABLE project_members_3d
  ADD CONSTRAINT member_3d_project_fk
    FOREIGN KEY (project_id) REFERENCES projects_3d(id) ON DELETE CASCADE,
  ADD CONSTRAINT member_3d_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE project_invites_3d
  ADD CONSTRAINT invite_3d_project_fk
    FOREIGN KEY (project_id) REFERENCES projects_3d(id) ON DELETE CASCADE;

ALTER TABLE project_handoffs_3d
  ADD CONSTRAINT handoff_3d_project_fk
    FOREIGN KEY (project_id) REFERENCES projects_3d(id) ON DELETE CASCADE
