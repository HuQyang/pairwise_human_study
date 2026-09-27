import { resolve } from 'node:path';
import { openStore } from '../server/store.js';

// Researcher-only CLI: no public endpoint exposes participant responses.
// Set DATABASE_URL to export from hosted Postgres, otherwise the local SQLite file is read.
const store = await openStore(process.env.DATABASE_URL || resolve(process.env.DATABASE_PATH || 'data/study.sqlite'), { readOnly: true });
const headers = ['submission_id', 'study_id', 'study_version', 'received_at', 'answer_order', 'timestamp', 'sample_id', 'question_id', 'question', 'left_method', 'right_method', 'response', 'preferred_method', 'response_time_ms'];
const escape = value => {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
process.stdout.write(`${headers.join(',')}\n`);
for (const row of await store.exportRows()) {
  process.stdout.write(`${headers.map(key => escape(row[key])).join(',')}\n`);
}
await store.close();
