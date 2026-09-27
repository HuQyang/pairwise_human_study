-- Store a complete survey in one row so saving it is atomic, even for large studies.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  study_version TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  responses_json TEXT NOT NULL CHECK (json_valid(responses_json))
);

-- Researchers can query one answer per row without duplicating stored data.
CREATE VIEW IF NOT EXISTS responses AS
SELECT
  s.id AS submission_id,
  CAST(j.key AS INTEGER) + 1 AS answer_order,
  json_extract(j.value, '$.timestamp') AS timestamp,
  json_extract(j.value, '$.sample_id') AS sample_id,
  json_extract(j.value, '$.question_id') AS question_id,
  json_extract(j.value, '$.question') AS question,
  json_extract(j.value, '$.left_method') AS left_method,
  json_extract(j.value, '$.right_method') AS right_method,
  json_extract(j.value, '$.response') AS response,
  json_extract(j.value, '$.preferred_method') AS preferred_method,
  json_extract(j.value, '$.response_time_ms') AS response_time_ms
FROM submissions s, json_each(s.responses_json) j;
