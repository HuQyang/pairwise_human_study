export async function sendSubmission(session, config, apiBase = '') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/submissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ submission_id: session.submissionId, study_id: config.id, study_version: config.version, responses: session.records }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Unable to submit right now. Please retry.');
    if (data?.submission_id !== session.submissionId || !Number.isFinite(Date.parse(data?.received_at))) throw new Error('The server did not confirm your submission. Please retry.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Could not reach the server. Check your connection and retry.');
    throw error;
  } finally { clearTimeout(timeout); }
}
