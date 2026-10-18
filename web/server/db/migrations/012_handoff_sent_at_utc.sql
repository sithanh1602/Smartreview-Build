-- sent_at was written by DEFAULT CURRENT_TIMESTAMP(3), the server's local time, but is read
-- as UTC like returned_at (UTC_TIMESTAMP). The code now writes UTC and moves earlier rows there.
UPDATE project_handoffs SET sent_at = CONVERT_TZ(sent_at, 'SYSTEM', '+00:00');
UPDATE project_handoffs_3d SET sent_at = CONVERT_TZ(sent_at, 'SYSTEM', '+00:00');
