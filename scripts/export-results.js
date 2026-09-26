import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

// Researcher-only CLI: no public endpoint exposes participant responses.
const db = new DatabaseSync(resolve(process.env.DATABASE_PATH || 'data/study.sqlite'), { readOnly: true });
const headers = ['submission_id', 'study_id', 'study_version', 'received_at', 'answer_order', 'timestamp', 'sample_id', 'question_id', 'question', 'left_method', 'right_method', 'response', 'preferred_method', 'response_time_ms'];
const escape = value => {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
process.stdout.write(`${headers.join(',')}\n`);
for (const row of db.prepare(`SELECT r.*, s.study_id, s.study_version, s.received_at
  FROM responses r JOIN submissions s ON s.id = r.submission_id
  ORDER BY s.received_at, s.id, r.answer_order`).iterate()) {
  process.stdout.write(`${headers.map(key => escape(row[key])).join(',')}\n`);
}
db.close();
