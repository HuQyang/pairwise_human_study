# Pairwise Human Study

A minimal Vite + React website for pairwise human evaluation.

## Run locally

```bash
npm install
npm run dev
```

## Add your study content

Edit `src/studyConfig.js`.

Put images in `public/images/`, then reference them like:

```js
image: "/images/example.png"
```

The site randomizes comparison order and left/right presentation. Results can be exported as CSV at the end.

## Build

```bash
npm run build
```

The static site is generated in `dist/`.

## GitHub Pages

1. Create a GitHub repository and push this folder.
2. If the repository will be hosted at `https://USERNAME.github.io/REPO/`, add a `base` value to `vite.config.js` such as `/REPO/` (a sample file is included).
3. Run `npm run deploy`, or configure GitHub Actions to deploy `dist/`.

For a user/organization root site (`USERNAME.github.io`), use `base: "/"`.

## Important before real data collection

This prototype stores answers only in the participant's browser until CSV export. For a public study with many independent participants, connect submission to a database/backend (for example Supabase/Firebase or your own endpoint) so responses are collected centrally.
# pairwise_human_study
