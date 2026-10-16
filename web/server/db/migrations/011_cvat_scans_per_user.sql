DROP TABLE IF EXISTS cvat_scans;

CREATE TABLE cvat_scans (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  job_id INT UNSIGNED NOT NULL,
  annotation_hash CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  engine_version VARCHAR(20) CHARACTER SET ascii NOT NULL,
  annotation_count INT UNSIGNED NOT NULL,
  risk_count INT UNSIGNED NOT NULL,
  duration_ms INT UNSIGNED NOT NULL,
  result MEDIUMTEXT NOT NULL,
  scanned_by_name VARCHAR(64) NOT NULL,
  scanned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_cvat_scan_user (user_id, job_id, scanned_at),
  CONSTRAINT cvat_scan_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB
