import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openStore } from './store.js';
import { createApp } from './app.js';

const databasePath = resolve(process.env.DATABASE_PATH || 'data/study.sqlite');
const store = openStore(databasePath);
const server = createApp({
  store,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  distDir: fileURLToPath(new URL('../dist', import.meta.url)),
});
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`Study server: http://${host}:${port}\nDatabase: ${databasePath}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
