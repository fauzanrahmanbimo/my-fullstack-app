# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a fullstack **"Vault.AI — AI Prompt & Workflow Vault"** application (Indonesian-language UI). It is split across the three top-level packages: `frontend/`, `backend/`, and `database/`. The product is a single-user dashboard for storing, editing, searching, copying, and exporting AI prompts, paired with live aggregate metrics.

There is no monorepo workspace tooling — each subdirectory is a standalone npm project with its own `package.json` and `node_modules`. Run commands from inside the relevant subdirectory.

## Common Commands

All commands are run from the package's own directory unless noted.

### Frontend (`frontend/`)

- `npm install` — install React 19 + Vite 8 + ESLint 10 deps
- `npm run dev` — start Vite dev server (default: http://localhost:5173)
- `npm run build` — production build → `dist/`
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint over `**/*.{js,jsx}` (uses `eslint.config.js`, ignores `dist/`)

There is no test runner configured in `frontend/package.json` — do not invent one.

### Backend (`backend/`)

- `npm install` — install Express 5 + sqlite + sqlite3
- `node src/index.js` — start the API on port 5000 (no `npm start` script is defined)
- The SQLite file is created at `backend/database.sqlite` on first boot and seeded with one row of `ai_metrics` if empty.

The `test` script is a placeholder that exits 1 — no test suite exists.

### Root

The root `package.json` only lists `cors` and `express` as direct deps and is unused at runtime — install happens inside each subpackage.

## Architecture

### Frontend (`frontend/src/`)

Single-page React 19 app using Vite. All UI lives in `App.jsx` — there are no routes, no separate components, and no state-management library. The component owns roughly a dozen `useState` hooks plus one `useRef` (toast timer) and a single `useEffect` that bootstraps data on mount.

Sections rendered top-to-bottom in `App.jsx`:
1. **Ambient background orbs** + **Navbar** (brand `Vault.AI`, four nav links, `FZ` avatar)
2. **Hero** with status badge, heading, description, and two CTAs ("Simpan Prompt Baru" opens the create modal; "Lihat Demo" is a non-functional placeholder)
3. **Stats grid** — four cards: Total Prompt, Cloud Usage %, Workflow Aktif, Eksekusi API. Values come from `/api/stats`.
4. **Vault History** — searchable grid of saved prompts with Copy / Edit / Delete actions and an "Export Backup" button (downloads `vault-backup.json`)
5. **Features section** — three static cards
6. **Footer**
7. **Modal** (create/edit) and **Toast** — both conditionally rendered

The `CATEGORIES` constant defines the four Indonesian categories used by the modal and rendered as color-coded badges (`Umum`, `Akademik`, `Produksi Video`, `Bisnis`). The category label is lowercased and hyphenated to produce a CSS modifier class (`vault-card__badge--umum`, etc.).

`main.jsx` is a standard `createRoot` + `<StrictMode>` bootstrap. `index.css` is global tokens/layout; `App.css` (~29 KB) carries all component-specific styling — it is large and self-contained.

### Backend (`backend/src/index.js`)

A single ~220-line Express 5 file (CommonJS). On boot it:
1. Applies CORS allowing `http://localhost:5173` and `http://127.0.0.1:5173` only, with `GET/POST/PUT/DELETE`.
2. Opens/creates `backend/database.sqlite` via the `sqlite` promise wrapper around `sqlite3`.
3. Runs idempotent `CREATE TABLE IF NOT EXISTS` for `ai_metrics` and `prompts`, and an `ALTER TABLE` to add the `category` column (errors are swallowed — the column already existing is the expected case).
4. Seeds `ai_metrics` with `(142, 68.5, 8, 2840)` if the table is empty.

Endpoints (all under `/api`):
- `GET  /api/stats` — return the single `ai_metrics` row.
- `POST /api/stats/eksekusi` — increment `totalPrompts +1` and `apiCalls +3`. **Not currently called by the frontend.**
- `GET  /api/prompts` — list all prompts ordered by `id DESC`.
- `POST /api/prompts` — insert prompt; increments `totalPrompts` and `apiCalls` by 1; returns updated `stats`.
- `PUT  /api/prompts/:id` — update title/content/category; returns the updated row. Does **not** touch metrics.
- `DELETE /api/prompts/:id` — delete row; decrements `totalPrompts` (floored at 0); returns updated `stats`.

The `prompts` schema is `{ id, title, content, category }`. Title and content are trimmed and required server-side. Category defaults to `'Umum'`.

`backend/controllers/`, `backend/models/`, `backend/middleware/`, and `backend/routes/` directories exist but are **empty** — the app intentionally keeps everything in `src/index.js`.

### Database (`database/`)

The live database is `backend/database.sqlite` (gitignored per `frontend/.gitignore` style — there is no top-level `.gitignore`; the file is created at runtime). `database/schema.sql`, `database/migrations/`, and `database/seeds/` are empty placeholders. The real schema lives in `initDatabase()` inside the backend.

## Cross-Package Conventions

- **API base URL** is hardcoded as `http://localhost:5000` in `frontend/src/App.jsx` (no env vars, no Vite proxy, no API client wrapper). To change it, edit the four `fetch` call sites in `App.jsx`. The CORS allowlist in the backend must match.
- **Language:** UI strings and copy are Indonesian (`Simpan`, `Hapus`, `Koleksi Tersimpan`, etc.) — keep new UI text in Indonesian to match the existing voice.
- **CSS naming:** BEM-style modifiers (`.vault-card__badge--umum`, `.cta-primary`, `.modal-btn--cancel`). All component styles live in `App.css`; there is no CSS Modules / Tailwind / styled-components setup.
- **Lint rules:** `react-hooks` recommended + `react-refresh` Vite preset. The codebase currently has no TypeScript.
- **IDs on interactive elements** (`btn-mulai-eksekusi`, `nav-dashboard`, `vault-card-${id}`, etc.) appear to be kept for end-to-end test selectors — preserve them when refactoring.

## Known Gaps / Things Not to "Fix" Surreptitiously

- `POST /api/stats/eksekusi` exists but is unreachable from the UI.
- Backend `controllers/`, `models/`, `middleware/`, `routes/` directories are empty.
- `database/schema.sql`, `database/migrations/`, `database/seeds/` are empty.
- Root `package.json` declares `cors` and `express` but is not a workspace; real installs happen per-subpackage.
- `frontend/.env` and root `README.md` exist but are empty.
