ALTER TABLE users MODIFY role ENUM('reviewer','annotator','leader','member') NOT NULL;

UPDATE users SET role=IF(role='reviewer','leader','member') WHERE role IN ('reviewer','annotator');

ALTER TABLE users MODIFY role ENUM('leader','member') NOT NULL DEFAULT 'member';

ALTER TABLE projects
  ADD COLUMN created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY idx_project_creator (created_by);

CREATE TABLE IF NOT EXISTS project_members (
  project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('reviewer','annotator') NOT NULL,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, user_id),
  KEY idx_member_user (user_id),
  CONSTRAINT member_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT member_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS project_invites (
  project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('reviewer','annotator') NOT NULL,
  code CHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, role),
  CONSTRAINT invite_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB
