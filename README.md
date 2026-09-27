# Pairwise Human Study

React survey with a Node.js API and a persistent SQLite database. Participants finish the survey and their answers are submitted automatically; they do not need to download or send CSV files.

## Run locally

Requires Node.js 22.13+ with `node:sqlite` support (Node 22 may print an experimental SQLite warning). No separate database server or extra backend dependencies are needed.

```bash
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://localhost:5173/pairwise_human_study/`. This starts both Vite and the API on port 3001; Vite proxies `/api` to the backend.

Answers and randomized presentation order are saved in the participant's browser after each step. Refreshing resumes the survey. Completing the final question submits the full response set. A failed submission keeps the answers and offers **Retry submission**; refreshing a pending completed survey retries automatically. If browser storage is disabled, participants are asked to keep the page open. Only a confirmed database save shows the thank-you message. One completed submission is retained per browser and study version; for another test run, clear this site's local storage or use a fresh browser profile.

## Study content

Edit `src/studyConfig.js` and add images in `public/images/`. For GitHub project Pages, image URLs must include your base path (e.g. `/pairwise_human_study/images/example.png`).

Keep `id` stable for a study and increment `version` when changing questions, comparisons, or methods. Frontend and backend must use the same configuration; deploy both together. Each comparison and question needs a unique ID. The server validates complete coverage and valid choices, and derives question text and preferred method from the configured study.

## Database and researcher export

Locally, the server creates `data/study.sqlite` automatically, or uses `DATABASE_PATH` from `.env`. If `DATABASE_URL` is set to a Postgres connection string (e.g. Neon or Supabase), the server uses that database instead and creates the same tables on startup:

- `submissions`: anonymous UUID, study ID/version, server receipt time and payload hash.
- `responses`: one row per answer, with submission ID, displayed answer order, sample/question, left/right methods, choice, preferred method, timestamp and response time.

All answers in a submission are committed in one transaction. Retrying the same submission returns its original receipt without inserting duplicates; reusing its ID with changed answers returns HTTP 409. This prevents network-retry duplicates, not multiple submissions from someone using different browsers.

Researchers can export all collected responses on the backend machine:

```bash
npm run --silent export:results > results.csv
```

To export from hosted Postgres on your own computer, pass its connection string (from Neon/Supabase):

```bash
DATABASE_URL='postgresql://...' npm run --silent export:results > results.csv
```

The Neon/Supabase web console can also browse the `responses` table and download it as CSV.

There is no public API for reading or exporting results. Do not commit or publish the database or exports. Back up SQLite using its backup facility, or stop the server before copying the database (WAL files may contain recent transactions).

## Deploy frontend and backend together

```bash
npm run build
HOST=0.0.0.0 npm start
```

The backend serves both `/api/submissions` and the built frontend from `dist/`. Open `http://localhost:3001/pairwise_human_study/`. Use an HTTPS reverse proxy for public access and a persistent writable volume for `DATABASE_PATH`, for example `/var/lib/pairwise-study/study.sqlite`. Run one backend instance with this SQLite file; ephemeral or read-only serverless filesystems will not retain results. `npm run preview` only previews static files and does not run the API.

## Deploy the backend on Render's free tier

Render's free instances have no persistent disk, so a SQLite file there is erased on every deploy, restart and sleep. Store responses in a free hosted Postgres database instead:

1. Create a Postgres database on [Neon](https://neon.tech) or [Supabase](https://supabase.com) and copy its connection string (keep `?sslmode=require`).
2. On the Render web service, set **Build Command** `npm install && npm run build` and **Start Command** `npm start`.
3. Under **Environment**, set `DATABASE_URL` to that connection string and `ALLOWED_ORIGINS=https://YOUR-USERNAME.github.io`. The server binds `0.0.0.0` automatically on Render (`HOST` can also be set explicitly).
4. Check `https://YOUR-SERVICE.onrender.com/api/health` returns `{"ok":true}`.

Free Render services sleep after about 15 minutes without traffic and take up to a minute to wake. The survey pings `/api/health` when it opens and every 10 minutes, and waits up to 60 seconds when submitting.

## Keep the frontend on GitHub Pages

GitHub Pages hosts static files and cannot run this backend. The `.github/workflows/pages.yml` workflow builds and publishes the frontend on every push to `main`; no `gh-pages` branch is needed.

One-time setup in the GitHub repository:

1. Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions → Variables**, add the repository variable `VITE_API_BASE_URL` with the HTTPS URL of your deployed backend. GitHub Actions does not read your local `.env`.
3. Push to `main`, or select **Actions → Deploy survey to GitHub Pages → Run workflow**. The workflow installs dependencies, runs tests, builds `dist/`, and uploads only that directory.
4. After the first successful Actions deployment, the old `gh-pages` branch can be removed. Do not merge its built HTML/assets into the source directory.

Deploy the Node server separately with persistent storage, then:

1. Set `ALLOWED_ORIGINS=https://YOUR-USERNAME.github.io` on the backend (origin only, no repository path). Multiple origins can be comma-separated. Restart the backend after changes.
2. Set the GitHub Actions repository variable `VITE_API_BASE_URL` described above. This public URL contains no credentials. For local builds, set it in `.env` before building instead.
3. Keep `base: '/pairwise_human_study/'` in `vite.config.js` consistent with your repository name, then commit and push to `main`. Publishing no longer uses `npm run deploy` or writes a separate branch.

The frontend sends `POST /api/submissions` to that backend over HTTPS. For same-origin hosting, leave `VITE_API_BASE_URL` unset. `GET /api/health` checks API availability. CORS restricts browser origins; the anonymous submission endpoint is public. If collecting a public study at scale, configure request rate limits at your reverse proxy.

## Verify

```bash
npm test
npm run build
```

Tests run against both SQLite and Postgres (via PGlite) and cover real API/database writes, atomic validation, retries, conflicting submissions, CORS, body limits, persistence, CSV export, and frontend receipt verification.
