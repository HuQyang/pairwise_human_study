import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { studyConfig } from '../src/studyConfig.js';

const origin = 'https://huqyang.github.io';
function payload() {
  return {
    submission_id: randomUUID(), study_id: studyConfig.id, study_version: studyConfig.version,
    responses: studyConfig.comparisons.flatMap(c => studyConfig.questions.map(q => ({
      timestamp: new Date().toISOString(), sample_id: c.id, question_id: q.id,
      left_method: c.a.method, right_method: c.b.method, response: 'left', response_time_ms: 1200,
      question: 'untrusted', preferred_method: 'untrusted',
    }))),
  };
}

test('Cloudflare Worker and real local D1 runtime', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pairwise-d1-test-'));
  const options = {
    modules: true,
    scriptPath: fileURLToPath(new URL('.worker-build/worker.js', import.meta.url)),
    compatibilityDate: '2026-07-01',
    bindings: { ALLOWED_ORIGINS: 'https://HuQyang.github.io:443/' },
    d1Databases: { DB: 'pairwise-test' },
    d1Persist: directory,
  };
  let mf = new Miniflare(options);
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  let db = await mf.getD1Database('DB');
  const migration = await readFile(new URL('migrations/0001_submissions.sql', import.meta.url), 'utf8');
  const statements = migration.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  await db.batch(statements.map(s => db.prepare(s)));
  const post = (body, extraHeaders = {}) => mf.dispatchFetch('https://test.workers.dev/api/submissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...extraHeaders }, body: JSON.stringify(body),
  });

  await t.test('CORS preflight permits canonical origin and denies lookalikes', async () => {
    const response = await mf.dispatchFetch('https://test.workers.dev/api/submissions', {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    for (const denied of ['https://huqyang.github.io.evil.example', 'http://huqyang.github.io', 'https://huqyang.github.io:8443']) {
      const result = await post(payload(), { Origin: denied });
      assert.equal(result.status, 403);
      assert.equal(result.headers.get('access-control-allow-origin'), null);
    }
  });

  await t.test('concurrent retries save exactly one complete questionnaire', async () => {
    const body = payload();
    const responses = await Promise.all([post(body), post(body), post(body)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 200, 201]);
    const receipts = await Promise.all(responses.map(r => r.json()));
    assert.equal(new Set(receipts.map(r => r.received_at)).size, 1);
    assert.ok(receipts.every(r => r.submission_id === body.submission_id));
    const { results: rows } = await db.prepare('SELECT * FROM responses WHERE submission_id = ? ORDER BY answer_order').bind(body.submission_id).all();
    assert.equal(rows.length, body.responses.length);
    assert.equal(rows[0].question, studyConfig.questions[0].text);
    assert.equal(rows[0].preferred_method, rows[0].left_method);
    body.responses[0].response = 'right';
    assert.equal((await post(body)).status, 409);
    assert.equal((await db.prepare('SELECT response FROM responses WHERE submission_id = ? AND answer_order = 1').bind(body.submission_id).first()).response, 'left');
  });

  await t.test('incomplete and invalid requests leave no partial database records', async () => {
    for (const mutate of [b => b.responses.pop(), b => { b.study_version = 'stale'; }, b => { b.responses[0].response = 'bad'; }]) {
      const body = payload(); mutate(body);
      const response = await post(body);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(await db.prepare('SELECT id FROM submissions WHERE id = ?').bind(body.submission_id).first(), null);
    }
    assert.equal((await post({ padding: 'x'.repeat(1024 * 1024) })).status, 413);
    assert.equal((await mf.dispatchFetch('https://test.workers.dev/api/submissions', { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await mf.dispatchFetch('https://test.workers.dev/api/submissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    })).status, 400);
  });

  await t.test('health checks D1 while participant records have no public read endpoint', async () => {
    const health = await mf.dispatchFetch('https://test.workers.dev/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal((await mf.dispatchFetch('https://test.workers.dev/api/submissions')).status, 405);
    assert.equal((await mf.dispatchFetch('https://test.workers.dev/api/results')).status, 404);
  });

  await t.test('saved answers survive Worker restart and schema reapplication', async () => {
    await mf.dispose();
    mf = new Miniflare(options);
    db = await mf.getD1Database('DB');
    await db.batch(statements.map(s => db.prepare(s)));
    const row = await db.prepare('SELECT COUNT(*) AS total FROM submissions').first();
    assert.equal(row.total, 1);
    const answers = await db.prepare('SELECT COUNT(*) AS total FROM responses').first();
    assert.equal(answers.total, studyConfig.comparisons.length * studyConfig.questions.length);
  });
});
