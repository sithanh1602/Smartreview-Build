CREATE TABLE IF NOT EXISTS frame_reviews (
  dataset_revision_id BIGINT UNSIGNED NOT NULL,
  frame_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  frame_reference TEXT NOT NULL,
  status ENUM('IN_PROGRESS','REVIEWED') NOT NULL DEFAULT 'IN_PROGRESS',
  missing_regions JSON NOT NULL,
  note TEXT NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (dataset_revision_id, frame_key),
  CONSTRAINT frame_review_revision_fk FOREIGN KEY (dataset_revision_id) REFERENCES dataset_revisions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
