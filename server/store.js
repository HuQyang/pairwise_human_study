import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { studyConfig } from '../src/studyConfig.js';

export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateSubmission(body) {
  const fail = (message) => { throw new RequestError(400, message); };
  if (!body || typeof body !== 'object') fail('Expected a JSON object.');
  if (typeof body.submission_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.submission_id)) fail('Invalid submission ID.');
  if (body.study_id !== studyConfig.id || body.study_version !== studyConfig.version) fail('Study version has changed. Please contact the researcher.');
  if (!Array.isArray(body.responses) || body.responses.length !== studyConfig.comparisons.length * studyConfig.questions.length) fail('Please answer every question.');
  const seen = new Set();
  const orientations = new Map();
  const responses = body.responses.map((r) => {
    if (!r || typeof r !== 'object') fail('Invalid response.');
    const comparison = studyConfig.comparisons.find(c => c.id === r.sample_id);
    const question = studyConfig.questions.find(q => q.id === r.question_id);
    if (!comparison || !question) fail('Unknown sample or question.');
    const key = JSON.stringify([r.sample_id, r.question_id]);
    if (seen.has(key)) fail('Duplicate answer.');
    seen.add(key);
    const validPair = (r.left_method === comparison.a.method && r.right_method === comparison.b.method) || (r.left_method === comparison.b.method && r.right_method === comparison.a.method);
    if (!validPair) fail('Invalid method pair.');
    if (orientations.has(r.sample_id) && orientations.get(r.sample_id) !== r.left_method) fail('Inconsistent presentation order.');
    orientations.set(r.sample_id, r.left_method);
    if (!['left', 'right', ...(studyConfig.allowTie ? ['tie'] : [])].includes(r.response)) fail('Invalid choice.');
    if (!Number.isSafeInteger(r.response_time_ms) || r.response_time_ms < 0) fail('Invalid response time.');
    if (typeof r.timestamp !== 'string' || r.timestamp.length > 40 || !Number.isFinite(Date.parse(r.timestamp))) fail('Invalid timestamp.');
    return {
      timestamp: new Date(r.timestamp).toISOString(), sample_id: comparison.id,
      question_id: question.id, question: question.text,
      left_method: r.left_method, right_method: r.right_method, response: r.response,
      preferred_method: r.response === 'tie' ? 'Tie' : r[`${r.response}_method`],
      response_time_ms: r.response_time_ms,
    };
  });
  return { submission_id: body.submission_id.toLowerCase(), study_id: studyConfig.id, study_version: studyConfig.version, responses };
}

export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY, study_id TEXT NOT NULL, study_version TEXT NOT NULL,
      received_at TEXT NOT NULL, payload_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS responses (
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      answer_order INTEGER NOT NULL, timestamp TEXT NOT NULL, sample_id TEXT NOT NULL,
      question_id TEXT NOT NULL, question TEXT NOT NULL, left_method TEXT NOT NULL,
      right_method TEXT NOT NULL, response TEXT NOT NULL, preferred_method TEXT NOT NULL,
      response_time_ms INTEGER NOT NULL,
      PRIMARY KEY (submission_id, sample_id, question_id)
    );
  `);
  const insertSubmission = db.prepare('INSERT INTO submissions VALUES (?, ?, ?, ?, ?)');
  const insertResponse = db.prepare('INSERT INTO responses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  return {
    db,
    save(raw) {
      const body = validateSubmission(raw);
      const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db.prepare('SELECT received_at, payload_hash FROM submissions WHERE id = ?').get(body.submission_id);
        if (existing && existing.payload_hash !== hash) throw new RequestError(409, 'This submission ID already contains different answers.');
        const receivedAt = existing?.received_at ?? new Date().toISOString();
        if (!existing) {
          insertSubmission.run(body.submission_id, body.study_id, body.study_version, receivedAt, hash);
          body.responses.forEach((r, i) => insertResponse.run(body.submission_id, i + 1, r.timestamp, r.sample_id, r.question_id, r.question, r.left_method, r.right_method, r.response, r.preferred_method, r.response_time_ms));
        }
        db.exec('COMMIT');
        return { submission_id: body.submission_id, received_at: receivedAt, duplicate: Boolean(existing) };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
