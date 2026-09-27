import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openStore } from './store.js';
import { createApp } from './app.js';

// DATABASE_URL (hosted Postgres) takes precedence over the local SQLite file.
const databaseUrl = process.env.DATABASE_URL;
const target = databaseUrl || resolve(process.env.DATABASE_PATH || 'data/study.sqlite');
const store = await openStore(target);
const server = createApp({
  store,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  distDir: fileURLToPath(new URL('../dist', import.meta.url)),
});
const port = Number(process.env.PORT || 3001);
// Render sets RENDER=true and must reach the server from outside the container.
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
server.listen(port, host, () => console.log(`Study server: http://${host}:${port}\nDatabase: ${databaseUrl ? 'Postgres (DATABASE_URL)' : target}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => { await store.close(); process.exit(0); }));
}
