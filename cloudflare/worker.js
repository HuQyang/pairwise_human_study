import { RequestError, validateSubmission } from './validation.js';

const MAX_BODY_BYTES = 1024 * 1024;

async function readJson(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'Send application/json.');
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RequestError(413, 'Submission is too large.');
  if (!request.body) throw new RequestError(400, 'Invalid JSON.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestError(413, 'Submission is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError(400, 'Invalid JSON.'); }
}

async function saveSubmission(db, raw) {
  const body = validateSubmission(raw);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const receivedAt = new Date().toISOString();
  // The primary key and D1's transactional batch also handle concurrent retries.
  const [inserted, selected] = await db.batch([
    db.prepare(`INSERT INTO submissions (id, study_id, study_version, received_at, payload_hash, responses_json)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`)
      .bind(body.submission_id, body.study_id, body.study_version, receivedAt, hash, JSON.stringify(body.responses)),
    db.prepare('SELECT received_at, payload_hash FROM submissions WHERE id = ?').bind(body.submission_id),
  ]);
  const saved = selected.results[0];
  if (!saved) throw new Error('Database did not confirm the write.');
  if (saved.payload_hash !== hash) throw new RequestError(409, 'This submission ID already contains different answers.');
  return { submission_id: body.submission_id, received_at: saved.received_at, duplicate: inserted.meta.changes === 0 };
}

export default {
  async fetch(request, env) {
    const headers = new Headers({
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
    });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    try {
      const url = new URL(request.url);
      const origin = request.headers.get('Origin');
      const allowed = new Set((env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean).map(value => {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid ALLOWED_ORIGINS.');
        return parsed.origin;
      }));
      if (origin && origin !== url.origin && !allowed.has(origin)) throw new RequestError(403, 'Origin is not allowed.');
      if (origin) headers.set('Access-Control-Allow-Origin', origin);
      if (!['/api/health', '/api/submissions'].includes(url.pathname)) throw new RequestError(404, 'Not found.');
      if (request.method === 'OPTIONS') {
        headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type');
        return new Response(null, { status: 204, headers });
      }
      if (url.pathname === '/api/health' && request.method === 'GET') {
        // Verify the binding and schema, not just that the Worker has started.
        await env.DB.prepare('SELECT id FROM submissions LIMIT 0').all();
        return json({ ok: true });
      }
      if (url.pathname !== '/api/submissions' || request.method !== 'POST') {
        headers.set('Allow', url.pathname === '/api/health' ? 'GET' : 'POST');
        throw new RequestError(405, 'Method not allowed.');
      }
      const receipt = await saveSubmission(env.DB, await readJson(request));
      return json(receipt, receipt.duplicate ? 200 : 201);
    } catch (error) {
      if (!(error instanceof RequestError)) console.error('Survey request failed:', error.message);
      return json({ error: error instanceof RequestError ? error.message : 'Unable to save responses. Please retry.' }, error instanceof RequestError ? error.status : 503);
    }
  },
};
