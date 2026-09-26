import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { openStore } from './store.js';
import { createApp } from './app.js';
import { studyConfig } from '../src/studyConfig.js';
import { sendSubmission } from '../src/submission.js';

function payload() {
  return {
    submission_id: randomUUID(), study_id: studyConfig.id, study_version: studyConfig.version,
    responses: studyConfig.comparisons.flatMap(c => studyConfig.questions.map(q => ({
      timestamp: new Date().toISOString(), sample_id: c.id, question_id: q.id,
      left_method: c.a.method, right_method: c.b.method, response: 'left', response_time_ms: 1200,
      question: 'untrusted client text', preferred_method: 'untrusted client text',
    }))),
  };
}

test('submission API and durable database', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pairwise-test-'));
  const databasePath = join(directory, 'study.sqlite');
  const store = openStore(databasePath);
  const server = createApp({ store, allowedOrigins: ['https://study.example'] });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/api/submissions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  await t.test('saves all responses and derives question/method on the server', async () => {
    const body = payload();
    const res = await post(body);
    assert.equal(res.status, 201);
    const receipt = await res.json();
    assert.equal(receipt.submission_id, body.submission_id);
    assert.ok(receipt.received_at);
    const rows = store.db.prepare('SELECT * FROM responses WHERE submission_id = ? ORDER BY answer_order').all(body.submission_id);
    assert.equal(rows.length, body.responses.length);
    assert.equal(rows[0].question, studyConfig.questions[0].text);
    assert.equal(rows[0].preferred_method, rows[0].left_method);
    const retry = await post(body);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).received_at, receipt.received_at);
    body.responses[0].response = 'right';
    assert.equal((await post(body)).status, 409);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM responses WHERE submission_id = ?').get(body.submission_id).count, rows.length);
  });

  await t.test('rejects incomplete, duplicate, invalid and stale answers without partial writes', async () => {
    const mutations = [
      b => b.responses.pop(),
      b => { b.responses[1] = b.responses[0]; },
      b => { b.responses[0].response = 'invalid'; },
      b => { b.responses[0].left_method = 'fake'; },
      b => { b.responses[0].response_time_ms = -1; },
      b => { b.study_version = 'old-version'; },
      b => { b.submission_id = '../invalid'; },
      b => { b.responses[0].timestamp = 'invalid'; },
    ];
    for (const mutate of mutations) {
      const body = payload(); mutate(body);
      assert.equal((await post(body)).status, 400);
      assert.equal(store.db.prepare('SELECT count(*) AS count FROM submissions WHERE id = ?').get(body.submission_id).count, 0);
    }
    const invalid = await fetch(`${base}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400);
  });

  await t.test('enforces allowed origins and exposes no result listing', async () => {
    assert.equal((await post(payload(), { Origin: 'https://untrusted.example' })).status, 403);
    const options = await fetch(`${base}/api/submissions`, { method: 'OPTIONS', headers: { Origin: 'https://study.example' } });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), 'https://study.example');
    assert.equal((await post(payload(), { Origin: 'https://study.example' })).status, 201);
    assert.equal((await post(payload(), { Origin: base })).status, 201);
    assert.equal((await fetch(`${base}/api/submissions`)).status, 405);
    assert.equal((await fetch(`${base}/data/study.sqlite`)).status, 404);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
  });

  await t.test('limits request bodies and content type', async () => {
    assert.equal((await fetch(`${base}/api/submissions`, { method: 'POST', body: 'hello' })).status, 415);
    const res = await post({ padding: 'x'.repeat(1024 * 1024) });
    assert.equal(res.status, 413);
  });

  await t.test('browser submission helper accepts a real receipt and retry is idempotent', async () => {
    const body = payload();
    const session = { submissionId: body.submission_id, records: body.responses };
    const receipt = await sendSubmission(session, studyConfig, base);
    assert.equal(receipt.submission_id, session.submissionId);
    assert.equal((await sendSubmission(session, studyConfig, base)).duplicate, true);
    await assert.rejects(sendSubmission({ ...session, records: [] }, studyConfig, base), /answer every question/);
  });

  await t.test('survives database reopen and exports researcher CSV', () => {
    const reopened = openStore(databasePath);
    assert.ok(reopened.db.prepare('SELECT count(*) AS count FROM submissions').get().count >= 3);
    reopened.close();
    const csv = execFileSync(process.execPath, ['scripts/export-results.js'], { env: { ...process.env, DATABASE_PATH: databasePath }, encoding: 'utf8' });
    assert.match(csv, /^submission_id,study_id,study_version,received_at/);
    assert.match(csv, /sample-001/);
    assert.ok(csv.trim().split('\n').length > 3);
  });
});

test('browser refuses a successful HTTP response without a valid receipt', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 200 }));
  await assert.rejects(sendSubmission({ submissionId: randomUUID(), records: [] }, studyConfig), /did not confirm/);
});
