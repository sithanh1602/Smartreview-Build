CREATE TABLE IF NOT EXISTS dataset_revisions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  fingerprint CHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  dataset_reference TEXT NOT NULL,
  name TEXT NOT NULL,
  schema_version VARCHAR(32) NOT NULL,
  engine_version VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS risk_cases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dataset_revision_id BIGINT UNSIGNED NOT NULL,
  annotation_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  annotation_reference TEXT NOT NULL,
  media_reference TEXT NOT NULL,
  frame_reference TEXT NOT NULL,
  frame_index BIGINT UNSIGNED NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  severity ENUM('high','medium','low') NOT NULL,
  is_suspicious BOOLEAN NOT NULL,
  check_ids JSON NOT NULL,
  UNIQUE KEY uq_case (dataset_revision_id, annotation_key),
  KEY idx_dataset_risk (dataset_revision_id, is_suspicious, severity),
  CONSTRAINT fk_case_dataset FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions(id),
  CONSTRAINT valid_score CHECK (score <= 100)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS review_decisions (
  risk_case_id BIGINT UNSIGNED PRIMARY KEY,
  decision ENUM('CORRECT','ERROR','UNSURE') NOT NULL,
  error_type ENUM('CLASS','BBOX','TRACKING','MISSING_OBJECT','EXTRA_OBJECT','OTHER') NULL,
  corrected_value TEXT NULL,
  note TEXT NULL,
  reviewer_id VARCHAR(255) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  reviewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_review_case FOREIGN KEY (risk_case_id) REFERENCES risk_cases(id),
  CONSTRAINT valid_error_fields CHECK (
    (decision = 'ERROR' AND error_type IS NOT NULL) OR
    (decision <> 'ERROR' AND error_type IS NULL AND corrected_value IS NULL)
  )
) ENGINE=InnoDB;
