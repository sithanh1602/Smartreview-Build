CREATE TABLE IF NOT EXISTS projects (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  format VARCHAR(40) NOT NULL,
  status ENUM('CREATED','UPLOADING','VALIDATING','NORMALIZING','ANALYZING','READY','FAILED') NOT NULL DEFAULT 'CREATED',
  error_message TEXT NULL,
  dataset_path TEXT NULL,
  dataset_revision_id BIGINT UNSIGNED NULL,
  metadata JSON NULL,
  demo_key CHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY project_dataset (dataset_revision_id),
  CONSTRAINT project_revision_fk FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions(id)
) ENGINE=InnoDB;
