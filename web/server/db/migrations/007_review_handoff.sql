CREATE TABLE IF NOT EXISTS project_handoffs (
  project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('SENT','RETURNED') NOT NULL DEFAULT 'SENT',
  dataset_fingerprint VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sent_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  sent_by_name VARCHAR(64) NOT NULL,
  recipients JSON NOT NULL,
  note VARCHAR(1000) NOT NULL DEFAULT '',
  report MEDIUMTEXT NOT NULL,
  sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  returned_by_name VARCHAR(64) NULL,
  returned_at DATETIME(3) NULL,
  result MEDIUMTEXT NULL,
  PRIMARY KEY (project_id),
  CONSTRAINT handoff_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB
