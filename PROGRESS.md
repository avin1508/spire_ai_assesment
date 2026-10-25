# Progress

**Current phase:** Final submission — all required features built and verified locally (see README "Verification status")
**Current prompt:** #55
**Last updated:** 2026-10-25

## Locked feature scope

The core assessment requirements come first. Other features must not break them.

**Core (required by the assessment)**
- Login / Signup
- Home / list screen backed by our own backend and database, with search
- Job detail screen

**Target features**
- Guest mode and resume upload
- Resume parsing and profile auto-fill
- AI-based job recommendations (Gemini)
- All Jobs with seeded jobs, search, and map/list views
- Recommended, Saved and Applied tabs
- Job detail screen
- Profile and Login/Signup
- Linking guest data to an account
- Resume re-upload and refreshed recommendations
- Agent Sigma: basic AI interaction
- Background resume processing (BullMQ + Redis)
- In-app notifications and FCM push notifications

**Locked stack:** React Native + Expo (JavaScript), React Navigation (not Expo Router), Node.js + Express (ES modules), MongoDB, Gemini, BullMQ + Redis, FCM. No TypeScript.

## Tasks

### Completed
- [x] Expo blank JavaScript project in `frontend/` (Prompt #1)
- [x] Express backend in `backend/` with `GET /health` (Prompt #1)
- [x] Backend `.env.example`, root `.gitignore`, README (Prompt #1)
- [x] Tracking files `AI_NOTES.md` and `PROGRESS.md`; README expanded (Prompt #2)
- [x] Setup committed by the user (`db79730 project setup`, `86a8442 project`)
- [x] React Navigation: main bottom tabs (Jobs, Skills, Learning, Profile) (Prompt #3)
- [x] Nested Jobs tabs (Recommended, All Jobs, Saved, Applied) with a custom top tab bar; All Jobs opens by default (Prompt #3)
- [x] Reusable components: AppHeader, JobsTabBar, LocationSearchBar, FilterChip, MapPlaceholder, MapControls, AgentSigmaButton, BottomActionBar (Prompt #3)
- [x] Opportunities screen UI with local mock data (Prompt #3)
- [x] Opportunities UI restyled to match the user's reference screenshot (Prompt #4)
- [x] Swipe navigation between the Jobs tabs using material top tabs and pager-view; the UI is unchanged (Prompt #5)
- [x] Recommended tab UI states: guest landing, loading, no matches, unavailable/error, job list (guest + signed-in variants) (Prompt #7)
- [x] Resume flow screens: file picker → resume confirmation → profile processing → editable profile form with validation (Prompt #7)
- [x] Session state (guest by default) and profile/recommendation state; header actions driven by session + profile (Prompt #7)
- [x] State moved from React Context to Redux Toolkit: `src/store/` with `session` and `profile` slices and a `loadRecommendations` async thunk (Prompt #8)
- [x] Service placeholder `parseResume` reports "not connected" instead of faking results (Prompt #7)
- [x] **Mock** recommendations: `fetchRecommendations` returns 5 hardcoded sample jobs from `src/data/mockRecommendations.js`, on the user's request (Prompt #9)

- [x] Sort sheet (Recommended / Aging / Fitment / Distance, with Distance disabled without data) and All Filters sheet (7 expandable sections, search, multi-select, counts, Clear all, Show N jobs); Verified, Last 24 hours and search filtering; filtered count in the tab label (Prompt #10)

- [x] Job Details screen (guest locks / signed-in), opened from Recommended job cards; skill match insights, formatted description, fixed Apply button with missing-data states (Prompt #11)

- [x] Profile tab (profile card, resume card, Experience and Education), Experience and Education lists with add, edit and delete, simulated resume parsing with sample data, and the resume flow reusable from Profile (Prompt #12)

- [x] Profile screen add / edit icons made display-only, not clickable (Prompt #13)
- [x] Real interactive map (Leaflet + OpenStreetMap tiles in a WebView), 120 mock jobs in 10 cities, clustering, map/list (Prompt #14; committed by the user; pin preview and list/filters not fully verified)
- [x] Shared Google-only guest login sheet, opened from all protected entry points through Redux + `useRequireAuth` (Prompt #15)
- [x] Apply requires login for guests on every job (Prompt #17)
- [x] **Phase A — guest device storage** (Prompt #22): profile, skills, experience, education and resume details saved in AsyncStorage (guest namespace); resume file copied into the app's document folder; missing-file and corrupt-data handling; re-upload keeps manual and edited entries; 25 unit tests (`npm test`); emulator scenarios D1–D6 plus regression passed

- [x] **Backend: Job model and seed** (Prompt #23): Mongoose `Job` schema from the frontend job records, conversion layer, idempotent `npm run seed:jobs`; 120 jobs seeded into MongoDB Atlas `spire_db.jobs`; 11 backend tests (`npm test`)
- [x] **Backend: Atlas connection fix, Job model refactor, 500 jobs** (Prompt #24):
  - `server.js` now loads `.env` and connects (with a ping) before it listens; `/health` reports the database state.
  - The model is now `src/models/job.model.js`: full description sections, company info, structured salary, GeoJSON + 2dsphere index. The old `models/Job.js` was removed.
  - A deterministic 500-job dataset (7 categories, 17 cities).
  - The seed has a reconciliation report and `--dry-run`.
  - 500 jobs in `spire_db.jobs`; 20 backend tests.

- [x] **Backend containerization + Redis connection** (Prompt #26):
  - `Dockerfile`, `.dockerignore`, and `docker-compose.yml` (project `spire-ai`) with the backend plus `redis:8.2-alpine`, health checks, and the backend waiting for a healthy Redis.
  - The backend connects to Redis through `REDIS_URL` (optional) using the `redis` client.
  - `/health` reports `redis`.
  - 22 backend tests.

- [x] **Production Docker setup** (Prompt #27):
  - `Dockerfile.prod`: multi-stage, production deps only, non-root, HEALTHCHECK.
  - `docker-compose.prod.yml` (project `spire-ai-prod`): Redis with a password, not published, persisted with AOF; read-only backend filesystem; restart always; memory limits; log rotation.
  - The development setup now uses `Dockerfile.dev` (nodemon, `./src` mounted). The old `Dockerfile` was replaced.

- [x] **All Jobs API + integration** (Prompt #29):
  - **Backend:** `/api/jobs` (list, page/limit/total/hasMore), `/api/jobs/map` (MongoDB grid clustering per zoom), `/api/jobs/summary`, `/api/jobs/filter-options`, `/api/jobs/:jobId`, with validation and 400/404/503 JSON errors.
  - **Frontend:** All Jobs uses the API (no mock fallback): map viewport events, server clusters, infinite scroll, details by id, and map/list shimmer.
  - **Tests:** backend 55, frontend 20.

- [x] **Phase 1: resume upload → profile** (Prompt #34):
  - **Backend:** upload API, GridFS storage, BullMQ worker, PDF/DOCX text extraction, Gemini (`GEMINI_MODEL`), status / retry / confirm / download, cleanup.
  - **App:** real processing screen, confirm-before-replace, guest session id, resume download.
  - **Tests:** backend 90, frontend 33.

- [x] **Job recommendations, guest flow** (Prompt #41):
  - Minimal matching profile stored on the server (no personal data); BullMQ `recommendations` queue + worker.
  - Candidate selection from the 500 real jobs, then Gemini ranking (validated: only real candidate ids).
  - Shared Gemini quota guard in Redis (optional RPM/TPM/daily limits, circuit breaker, 429 → deferred, daily quota → after midnight Pacific).
  - Regeneration on matching-profile changes; recovery after app restart.
  - Tests: backend 119, frontend 27.
- [x] **Fix: wrong recommendations after uploading a different person's resume** (Prompt #42):
  - New resume replaces resume-derived skills, role and experience; manual entries kept.
  - Skill spellings normalised ("React.js" = "React", "Node.js" = "Node"), so known skills are no longer gaps.
  - Generic title words ("developer", "engineer") no longer match unrelated roles; rules version in the hash forces fresh results.
  - Tests: backend 121, frontend 30. Live: MERN → Java → Data → MERN resumes in one guest session, all checks pass.
- [x] **Emulator end-to-end verification** (Prompt #43):
  - Passed: Java → MERN resume replacement in the app UI, recommendations, React matching, restart, loading and error/recovery states.
  - Deferred and empty states not verified in the UI (tests only).

### In progress
- [ ] Review of the All Jobs API integration (Prompt #29)
- [ ] Review of the Docker + Redis setup (Prompts #26–#27)
- [ ] Review of the Job model refactor and 500-job seed (Prompt #24)
- [ ] Review of Prompts #14–#15
- [ ] Finish verifying Prompt #14: pin preview, list view, search and filters on the map, current location

### Pending
- [ ] Commit of the Prompt #15 changes (waiting for approval)
- [ ] Google OAuth client IDs in `frontend/.env`, plus a development build or APK (Google sign-in can't run in Expo Go)
- [ ] Backend `POST /api/auth/google` that verifies the Google ID token and returns a session (`authService.signInWithGoogleToken` rejects until then)
- [ ] Production map tile provider (`EXPO_PUBLIC_MAP_TILE_URL`); the public OSM server is for development only
- [ ] Replace simulated resume parsing (`parseResume` MOCK) with the backend parser
- [ ] All Jobs job list (needed to open Job Details from All Jobs)
- [ ] Save job and email job for signed-in users (currently "Coming soon")
- [ ] Distance sort: needs real user and job location data
- [ ] Replace mock recommendations with the backend matching API
- [ ] Backend: resume upload + parsing (BullMQ + Gemini) to back `parseResume`
- [ ] Backend: recommendations API to back `fetchRecommendations`
- [ ] Persisting the confirmed profile (currently in-memory only)
- [ ] MongoDB connection and data models
- [ ] Save job (signed-in) and Saved/Applied persistence
- [ ] Seeded jobs, jobs list API with search
- [ ] Jobs list view content, Job detail screen
- [ ] All other target features listed above

## Test results

| Date | Check | Result |
| --- | --- | --- |
| 2026-10-24 | Backend `npm start` + `curl /health` | Passed: `{"status":"ok"}` |
| 2026-10-24 | Backend `npm run dev` (nodemon, PORT=5055) + `curl /health` | Passed: `{"status":"ok"}` |
| 2026-10-24 | Expo `CI=1 npx expo start`, `/status` + Android bundle request (blank app) | Passed |
| 2026-10-24 | `npx expo-doctor` (Prompt #3) | Failed at first: missing `expo-font` peer dependency. Fixed; then passed 20/20 |
| 2026-10-24 | `npx expo export --platform android` (Prompt #3) | Passed: Hermes bundle built |
| 2026-10-24 | Expo Go on Android emulator (Pixel_5 AVD), Opportunities screen | Passed after a fix: the map was blank at first (see AI_NOTES #3), then rendered correctly |
| 2026-10-24 | Emulator taps: list/map toggle, Saved tab, Skills tab, back to Jobs | Passed: all switched correctly; Jobs kept its nested tab state |
| 2026-10-24 | Restyled UI on emulator vs the reference screenshot (Prompt #4) | Passed: bundle built, no Metro errors; layout matches closely; the Applied tab scrolls into view |
| 2026-10-24 | Jobs tab swipe on emulator (Prompt #5) | Passed: swipes in both directions across all 4 tabs; label taps still work; the chip row scrolls without changing tabs; expo-doctor 20/20 |
| 2026-10-24 | Visual check of emulator vs the user's 4 phone screenshots (Prompt #6) | Passed: header, tabs, empty states, map and bottom nav match; no code changes needed. The only difference is the Expo Go dev-tools gear button (not app UI) |
| 2026-10-24 | Prompt #7 checks: `expo-doctor`, `expo export --platform android`, no `.ts`/`.tsx` | Passed: 20/20, bundle built, 0 TS files |
| 2026-10-24 | Prompt #7 guest flow on emulator with the real (unconnected) services | Passed: landing → system file picker → confirmation (real name + size) → honest "couldn't build your profile" → manual form → validation errors on empty submit → saved → Recommended shows "Recommendations aren't ready yet" + Sign up header |
| 2026-10-24 | Prompt #7 states that need data, using a **temporary** test patch (reverted, 0 `TEMP-` markers left) | Passed: "Building Your Profile" in-progress view; "Agent Sigma is on the hunt" loading view; guest job cards with lock badges + sign-up prompt; signed-in cards without locks, name/email prefill, Learning entry from a gap chip, overflow chevron, cards without gaps/verified |
| 2026-10-24 | Redux Toolkit migration (Prompt #8): `expo-doctor`, export, emulator flow | Passed: 20/20, bundle built, full resume flow + retry work through Redux |
| 2026-10-24 | Mock recommendations (Prompt #9) on emulator | Passed: loading state, then Recommended (5) with job cards |
| 2026-10-24 | Sort and filter sheets (Prompt #10) on emulator | Passed: Sort sheet and Fitment order; All Filters sections; Location multi-select + search; Company search; apply → Recommended (3) / All Filters (1); selections kept on reopen; Verified, Last 24 hours, search, no-match + Clear filters; other tabs open; expo-doctor 20/20 |
| 2026-10-24 | Job Details (Prompt #11) on emulator | Passed: correct job shown; long description scrolls with a fixed Apply button; guest locks and sign-up prompts; Back keeps filters; no-URL and no-description states; signed-in: no locks, Learning link, Apply opens the URL (Chrome then crashed on its own first run). Not testable: opening from All Jobs (no job list) |
| 2026-10-24 | Profile, Experience and Education (Prompt #12) on emulator | Passed: empty state → simulated flow → back to Profile; layout matches the references; Experience list, edit mode, add with validation, delete; Education add; edit profile and replace resume return to Profile; Jobs shows Recommended (5); no errors |
| 2026-10-24 | Backend `npm test` (Prompt #24) | Passed: 20/20 |
| 2026-10-24 | Server start + `curl /health` (Prompt #24) | Passed: `{"status":"ok","database":"connected"}` |
| 2026-10-24 | `npm run seed:jobs -- --dry-run`, then seed twice (Prompt #24) | Passed: dry run showed 0 existing / 500 to insert. Run 1: inserted 500, invalid 0. Run 2: inserted 0, updated 0, unchanged 500; total 500 |
| 2026-10-24 | Atlas read-back (Prompt #24) | Passed: 500 docs, 500 unique jobIds, 0 schema errors, geo matches lat/lng, all within 35 km of their city, content matches the dataset, frontend `validateJobs` accepts all 500 converted jobs, 2dsphere `$near` query works |
| 2026-10-24 | State check (Prompt #25) | Passed: Atlas 500 jobs, 500 unique jobIds, 0 duplicates, 0 missing required fields, 0 schema errors; backend `npm test` 20/20; `/health` → `{"status":"ok","database":"connected"}`; no credentials in the working tree |
| 2026-10-24 | Docker Compose stack (Prompt #26) | Passed: `docker compose config` valid; image built; redis and backend both `(healthy)`; `/health` from host → `{"status":"ok","database":"connected","redis":"connected"}`; backend container PING via hostname `redis` → PONG; `.env` not in image, no DB_* in image env; Atlas count still 500 |
| 2026-10-24 | Redis failure handling (Prompt #26) | Passed: Redis stopped → `/health` 503 `redis: "connecting"`; Redis restarted → client reconnected, 200. Unreachable `REDIS_URL` at startup → exits 1 after 5 attempts. Host run without `REDIS_URL` → `redis: "not_configured"`, 200; host run with `redis://localhost:6379` → connected |
| 2026-10-24 | Backend `npm test` (Prompt #26) | Passed: 22/22 |
| 2026-10-24 | Development Compose (Prompt #27) | Passed: both containers (healthy); `/health` connected/connected; `NODE_ENV=development`; touching `src/server.js` → nodemon restarted, then healthy again |
| 2026-10-24 | Production Compose (Prompt #27) | Passed: missing `REDIS_PASSWORD` → Compose refuses; with a password both containers (healthy); `/health` connected/connected; Redis port not reachable from the host; `redis-cli ping` without a password → NOAUTH, with it → PONG; appendonly yes; backend runs as `node`, read-only filesystem, no nodemon, `NODE_ENV=production`; restart=always, memory limits and log rotation applied; recovered after a Redis restart; password not in the image |
| 2026-10-24 | Backend `npm test` (Prompt #27) | Passed: 22/22 |
| — | iOS device or simulator | **Not tested** (no macOS available) |
| — | Physical Android device | **Not tested** |
| 2026-10-24 | Backend `npm test` (Prompt #29) | Passed: 55/55, including 33 API integration tests on in-memory MongoDB with the 500-job dataset |
| 2026-10-24 | Frontend `npm test` (Prompt #29) | Passed: 20/20 (loading/shimmer rules, stale responses, paging, params) |
| 2026-10-24 | `expo export --platform android`, `expo-doctor` (Prompt #29) | Passed: bundle built; 20/20 |
| 2026-10-24 | Real API against Atlas (read-only, Prompt #29) | Passed: list 500 / 25 pages, map zoom 5 → clusters totalling 500, last24h total 13, details, 400/404 errors, distance sort |
| 2026-10-24 | Emulator, All Jobs with the real API (Prompt #29) | Passed: <ul><li>cold-start skeleton (chip pills, dots pill, bottom pill)</li><li>dots + bottom skeleton during zoom with markers kept</li><li>map error pill + retry</li><li>Hyderabad cluster: "50 jobs in this area · 30 companies", then View list showing exactly 50</li><li>Show all → 500 with infinite scroll, footer shimmer, next-page error + retry (re-requested page 4 only)</li><li>Job Details: description skeleton, then API sections</li><li>Last 24 hours chip → View jobs (13)</li><li>All Filters real counts (Pune 45 → Show 45 jobs → map fit to Pune)</li></ul> |
| — | Linting | **Not available**: no ESLint config in the project; none added to avoid extra dependencies |

## Known issues
- The reference screenshot arrived with Prompt #4, and the UI was restyled to match it. Positions are estimates; it is not a pixel-perfect match.
- Jobs tab swipe is enabled on All Jobs. The map is static now, so there is no gesture conflict. When a real map is added, disable swipe on All Jobs or limit it to non-map areas.
- The mock company names (Kotak Mahindra, Accenture) and job count (186445) were taken from the reference screenshot and are placeholders.
- Map controls, Agent Sigma, share/notification icons and View Companies / View Jobs don't do anything yet (UI only). Search input and filter chips on the map only update local state. The header's Upload Resume now starts the resume flow (Prompt #7).
- Prompt #7: only 4 distinct reference screenshots were received (2 of the 6 were duplicates). The guest landing (State 1) and the resume confirmation / processing screens (States 2–3) were built from the written description and need visual review.
- **Resume parsing is SIMULATED** (Prompt #12): every resume "extracts" the same fictional sample profile after 3 s (`src/data/mockResume.js`). The processing steps are a UI-only timer.
- Profile data (including experience and education) lives in memory only and is lost on app restart. Settings and resume download aren't available yet.
- Filter options and counts come from the 5 mock jobs. Mock rec-1 has the location "Benhgaluru" (a typo edited into the working file), which shows as a separate Location option.
- **Recommendations are MOCK data** (Prompt #9): every profile gets the same 5 hardcoded sample jobs. This is not AI matching and must be replaced before any claim of real recommendations.
- Prompt #7: the profile, resume and recommendations live in memory only and are lost when the app restarts. A hardware Back on the profile form discards typed values without confirmation.
- Prompt #7: there is no sign-in screen yet. "Sign up" opens the Profile tab placeholder; the signed-in UI could only be checked with a temporary test user.
- Prompt #7: the "Use current location" icon on the profile form shows "coming soon" (location permissions are out of scope). Save on a signed-in job card is not wired yet.
- The map is a static, locally drawn illustration. Marker positions are mock percentages, not real coordinates.
- The Expo template added `frontend/AGENTS.md` and `frontend/.claude/settings.json`. `AGENTS.md` recommends Expo Router and TypeScript checks, which don't match this project (React Navigation, JavaScript only). Both files have been kept for now.
- `npm install` in `frontend/` reports `npm audit` warnings in transitive dependencies. They have not been fixed, because `audit fix --force` could break SDK version pins.

- Prompt #24: the user deleted the 120 Prompt #23 jobs on purpose before the new seed, so the collection was empty as expected. The 500-job seed reuses all of their jobIds.
- Prompt #24: `postedAt` is set once on first insert, so "Last 24 hours" / aging counts shrink over time (14 jobs were in the last 24 hours at seed time). Re-dating needs a deliberate option; it is not done automatically.
- Prompt #24: the app still uses its local 120 mock jobs. The 500 seeded jobs appear only once the Jobs API exists.

- Prompt #27: the production Compose setup is single-host with no HTTPS or reverse proxy; one is needed before exposing port 5000 to the internet. The Redis password is visible to anyone who can run `docker inspect` on that host (environment variables). Development Redis has no persistence.

- Prompt #29: grid clustering can draw neighbouring clusters overlapping when their jobs sit near a cell edge (seen at Mumbai/Pune at zoom 5 and inside Pune at zoom 11). Counts and View list stay exact. Fixing it needs a merge step or point-based clustering (decision pending).
- Prompt #29: "Last 24 hours" uses the stored `postedAt`; it already shows 13 and will drop to 0 as the seed ages. The dates are not changed.
- Prompt #29: the app defaults to `http://10.0.2.2:5000`. A backend process started before Prompt #29 must be restarted to serve `/api/jobs`.
- Prompt #29: the guest-storage unit tests from Phase A (Prompt #22) are not in the repository (never committed); `frontend/tests` now holds only the All Jobs tests.

## Remaining assessment deliverables
- [x] Source repository with regular Git commits (secrets and .env files never committed)
- [x] README with setup, technology choices, completed and missing features (rewritten in Prompt #55)
- [x] AI notes with tools, key prompts and one genuine AI mistake that was corrected (summary added in Prompt #55)
- [x] Working demo on the Android emulator (development build; local backend in Docker)
- [ ] Ability to explain the code
- [ ] Ability to make a small live change during the demo
- [x] **Email/password accounts + guest linking** (Prompt #45):
  - User / Session / Profile / GuestLink models; register, login, logout, me, link-guest; profile API with revisions.
  - Login / Register screens, secure session storage, logout, account-scoped data, profile server sync.
  - Tests: backend 149, frontend 43. Emulator E2E: Scenarios A, B (both cases), C and D passed. Signed-in resume upload in the UI not verified (emulator out of memory).
- [x] **Keyboard fix for Login, Register and Profile Confirm** + signed-in resume / recommendation E2E (Prompt #46): verified on the Android emulator. Tests: backend 149, frontend 43.
- [x] **Push notifications for finished recommendations** (Prompt #47): device registration per owner, at-most-once FCM send after completion, tap → Recommended. Tests: backend 160, frontend 48.
  - [ ] Real delivery: needs a Firebase service-account key (`FIREBASE_SERVICE_ACCOUNT_FILE`) and an Android development build.
- [x] **Real push delivery verified** (Prompt #48): key file auto-detected and mounted read-only; Android development build; guest and logged-in pushes received and tapped on the emulator. Tests: backend 162, frontend 49.
- [x] **Notification permission soft-ask** (Prompt #50): own explanation sheet after profile confirm, system dialog only on "Notify me", 7-day "Not now" cool-down; verified on the dev build.
- [x] **Full end-to-end re-test from a fresh app** (Prompt #51): permission soft-ask, guest + account notifications and taps, guest→account linking, logout/login device ownership — all passed. Fixed: the API process now also sends (late notification after permission).
