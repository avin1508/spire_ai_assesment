# Spire.AI iExchange Clone

A job-matching mobile app built with AI assistance for the Spire.AI AI-Native Full-Stack Mobile Developer practical assessment. Users browse and search jobs from our own backend on a map or in a list, open job details, sign up / log in with email and password, upload a resume that is parsed into a profile by AI, get AI-ranked job recommendations, and receive a push notification when the recommendations are ready.

**Demo setup:** everything runs locally — Expo app on an Android emulator, Express API + Redis + BullMQ worker in Docker Compose, MongoDB Atlas, Gemini, Firebase Cloud Messaging.

## Features

| Feature | Status |
| --- | --- |
| **Login** — email/password register, login, logout; sessions survive app restarts | Done, verified |
| **Home screen with items from our backend + search** — 500 seeded jobs on an interactive map (clusters, company markers) and an infinite-scroll list; search, filters (location, company, experience, title, aging, verified, last 24 h), sort | Done, verified |
| **Detail screen** — job summary, skill match (Exact Match / Gaps), formatted description, apply link | Done, verified |
| **Resume upload & AI parsing** — PDF/DOCX ≤ 5 MB, parsed in the background (BullMQ worker + Gemini) into an editable profile | Done, verified |
| **AI job recommendations** — candidates picked from the database, ranked by Gemini, with fit label, matched skills and gaps | Done, verified |
| **Guest mode + account linking** — guests can do everything above; on register/login their profile, resume and recommendations are linked to the account (an existing account profile is never overwritten) | Done, verified |
| **Profile** — profile card, resume download/replace, experience and education lists with add/edit/delete; synced to the server | Done, verified |
| **Push notifications** (nice to have) — "Your job recommendations are ready!" via FCM, permission asked with an explanation first, tap opens Recommended | Done, verified on a development build (Android) |

### Not included / limitations
- **Saved and Applied tabs, Skills and Learning tabs** are placeholders (out of scope for the assessment).
- **Edit profile pencil** on the Profile card is display-only (profile is edited by re-uploading a resume or via the Experience/Education screens).
- **Push notifications:** Android only, and only in a development build — Expo Go cannot receive them (Expo SDK 53+). iOS push isn't set up.
- **Production (Render):** the API is deployed, but no BullMQ worker runs there, so resume parsing and recommendations only complete locally. The demo uses the local setup.
- **Map tiles** come from the public OpenStreetMap server (fine for development, not for production traffic).
- The app's display name is still `frontend` (from `app.json`).

## Technology stack

| Layer | Technology |
| --- | --- |
| Mobile app | React Native 0.88 + Expo SDK 58, **JavaScript only** |
| Navigation / state | React Navigation 7 (stack, bottom tabs, top tabs), Redux Toolkit |
| Map | Leaflet in a WebView (`react-native-webview`), server-side clustering |
| Backend | Node.js 22 + Express 5 (ES modules) |
| Database | MongoDB Atlas + Mongoose 9 (resume files in GridFS) |
| Background jobs | BullMQ + Redis 8 (Docker) — resume parsing and recommendation queues, one worker process |
| AI | Google Gemini (`gemini-3.5-flash-lite`, `@google/genai`) for resume parsing and job ranking |
| Auth | bcrypt password hashes, revocable server-side sessions (SHA-256 token hashes), `expo-secure-store` on the device |
| Push | Firebase Cloud Messaging HTTP v1 (`google-auth-library`), `expo-notifications`, Android development build (`expo-dev-client`) |
| Tests | Node's built-in test runner; `mongodb-memory-server` for API tests |

Why: Expo + JS for speed of iteration with AI tooling; Express/Mongo/Redis are simple and well known; BullMQ keeps slow AI calls out of HTTP requests (retries, recovery, quota handling); Gemini Flash-Lite is fast and cheap for structured JSON output.

## Project structure

```
spire_ai/
├── frontend/                Expo app
│   ├── App.js               providers, navigation, session restore, notification taps
│   ├── app.json             Expo config (Android package com.spireai.iexchange)
│   ├── google-services.json Firebase client config for Android
│   └── src/  screens/ components/ navigation/ store/ services/ storage/ notifications/ utils/ hooks/ config/
├── backend/
│   ├── src/  server.js (API) · worker.js (BullMQ worker) · app.js · routes/ services/ models/ queue/ workers/ middleware/ data/ seed/ scripts/
│   ├── tests/               node --test (API, worker, auth, linking, push, …)
│   ├── docker-compose.yml   development: backend + worker + Redis
│   ├── docker-compose.prod.yml
│   └── .env.example
├── AI_NOTES.md              AI tools, key prompts, mistakes and fixes, full prompt log
├── PROGRESS.md              task tracking
└── README.md
```

## Prerequisites

- Node.js 22 (developed on 22.21.1) and npm 10
- Docker Desktop (runs the API, Redis and the worker)
- A MongoDB Atlas database and a Gemini API key (Google AI Studio)
- Android Studio with an emulator image **with Google Play** (Android 13+), or an Android phone
- For push notifications: a Firebase project and its service-account key file (see below)

## Setup

### 1. Backend environment
```bash
cd backend
cp .env.example .env      # fill in the values — see .env.example for every variable
```
Required: `DB_USERNAME`, `DB_PASSWORD`, `DB_CLUSTER_URL`, `DB_NAME`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
Optional: `PORT`, `REDIS_URL` (Compose sets it), `REDIS_PASSWORD` (production Compose), `GEMINI_RPM` / `GEMINI_TPM` / `GEMINI_DAILY_BUDGET`, `RECOMMENDATION_CONCURRENCY`, `RECOMMENDATION_FRESH_HOURS`, `SESSION_TTL_DAYS`, `BCRYPT_ROUNDS`.

**Push notifications:** put the Firebase service-account key (`<project>-firebase-adminsdk-….json`, from Firebase Console → Project settings → Service accounts) in `backend/`. It is found automatically by its name pattern, git-ignored, and mounted read-only into the containers. Without it the app works; only push is disabled (the logs say so).

### 2. Seed the jobs (once)
```bash
cd backend
npm install
npm run seed:jobs            # upserts 500 fictional demo jobs by jobId; safe to re-run, never deletes
```

### 3. Frontend environment
```bash
cd frontend
npm install
cp .env.example .env
```
`EXPO_PUBLIC_API_URL` = backend address seen from the device: `http://10.0.2.2:5000` on the Android emulator (default when unset), `http://<your-PC-LAN-IP>:5000` on a phone on the same Wi-Fi. Optional: `EXPO_PUBLIC_MAP_TILE_URL`, `EXPO_PUBLIC_MAP_ATTRIBUTION`.

## Running

### Backend, Redis and worker (Docker)
```bash
cd backend
docker compose up -d --build     # backend (port 5000) + redis + worker
docker compose ps                # backend and redis (healthy), worker (Up)
docker compose logs -f worker    # worker logs: jobs started / completed
```
Health checks: `http://localhost:5000/health` → `database: connected, redis: connected`; `http://localhost:5000/health/queues` → `workers: 1` on both queues.

### The app
```bash
cd frontend
npx expo start --clear           # keep this window open
```
- **Development build (needed for push notifications):** build and install once, then press `a` in the Expo window to open it.
  ```bash
  npx expo run:android --no-bundler
  ```
  On Windows, if the native build fails with a path-length error (`ninja: error: mkdir … No such file or directory`), build from a short drive: `subst S: D:\spire_ai`, run the command from `S:\frontend`, then `subst S: /D` (details in AI_NOTES, Prompt #48).
- **Expo Go:** everything except push notifications works; scan the QR code or press `a`.
- **Physical phone:** install the development build (`frontend/android/app/build/outputs/apk/debug/app-debug.apk`, `adb install …`), set `EXPO_PUBLIC_API_URL` to your PC's LAN IP, and keep Metro running. No standalone release APK is provided; the demo runs on the emulator.

## Demo script

1. Fresh start (optional): `adb shell pm clear com.spireai.iexchange`, then press `a` in the Expo window.
2. **All Jobs:** map with clusters → zoom → company markers; list view; search (e.g. "react"); filters.
3. **Job details:** tap a job.
4. **Recommended → Upload Resume** → pick a PDF → confirm → "Building your profile" → review the profile → **Done**.
5. **Notifications:** our sheet "Get notified when your matches are ready" → **Notify me** → Android **Allow** → press Home → the notification arrives in ~10–20 s → tap it → Recommended jobs open.
6. **Sign up** (header) → create an account → the guest profile and recommendations are now in the account.
7. **Profile → Settings → Log out** → empty guest; **log in** again → the account's data is back.

If a notification is late on the emulator, toggle its network (`adb shell svc wifi disable; adb shell svc wifi enable`) — the emulator's connection to Google sometimes stalls. A profile identical to one already processed reuses the existing recommendations instantly and doesn't notify again.

## Tests
```bash
cd backend  && npm test     # 165 tests: jobs API, resume pipeline, recommendations, auth, guest linking, push
cd frontend && npm test     # 50 tests: list/map logic, profile merge, auth forms, session restore, sync, push decisions
cd frontend && npx expo-doctor
```
Backend API tests use an in-memory MongoDB (`mongodb-memory-server`, downloads a binary on first run); Atlas, Gemini and Firebase are never called (fakes are used).

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | API, MongoDB and Redis status |
| GET | `/health/queues` | Waiting/active/failed jobs and connected workers per queue (+ hints) |
| GET | `/api/jobs` | Job list (`page`, `limit`, `sort`, `q`, filters) |
| GET | `/api/jobs/map` | Map clusters and office markers for `bbox` + `zoom` |
| GET | `/api/jobs/summary`, `/api/jobs/filter-options` | Totals/bounds and filter counts |
| GET | `/api/jobs/:jobId` | Job details |
| POST | `/api/auth/register`, `/api/auth/login` | Create account / log in → `{ user, token, expiresAt }` |
| POST | `/api/auth/logout` · GET `/api/auth/me` | Revoke the session · current user |
| POST | `/api/auth/link-guest` | Link a guest session's data to the account (idempotent) |
| GET / PUT | `/api/profile` | The owner's complete profile (revision-checked saves) |
| POST | `/api/resumes` | Upload a resume (multipart `file`) → queued job |
| GET | `/api/resumes/jobs/:jobId` | Processing status (+ extracted profile when done) |
| POST | `/api/resumes/jobs/:jobId/retry`, `/api/resumes/:resumeId/confirm` | Retry a failed job · make it the owner's resume |
| GET | `/api/resumes/:resumeId/download` | Download the owner's resume |
| POST | `/api/recommendations` · GET `/api/recommendations/current` | Request / read recommendations |
| POST | `/api/recommendations/:id/retry` | Retry a failed run |
| PUT / DELETE | `/api/devices` | Register / remove this device's push token |

Identity: `Authorization: Bearer <token>` for a signed-in user, otherwise `X-Guest-Session: <uuid>` for a guest. Errors are `{ error, message, details? }`.

## Verification status

| Check | Result |
| --- | --- |
| Automated tests | Backend 165/165, frontend 50/50 pass; Android bundle builds; `expo-doctor` 20/20 |
| Local stack | API, MongoDB, Redis and worker healthy; both queues have a connected worker |
| API end-to-end (synthetic account) | Register, wrong password rejected, login, me, jobs list (500), search, map, details, resume upload → parsed in ~8 s → confirmed, profile saved, 15 recommendations in ~10 s, logout + token revoked — 16/16 |
| App on the Android emulator (development build) | Guest resume flow, permission prompt, notification received and tapped, register with guest linking, account notification, logout/login, restart — verified 2026-10-25 (see AI_NOTES) |
| Production (Render) | API healthy; no worker, so parsing/recommendations stay queued — not part of the demo |

## Submission checklist

- [x] Source repository with regular commits; `.env` files and the Firebase service-account key are git-ignored and were never committed
- [x] README: how to run, technology choices, completed and missing features (this file)
- [x] AI notes: tools, key prompts, an AI mistake and its fix, manual verification ([AI_NOTES.md](AI_NOTES.md))
- [x] Login, home screen with backend data + search, detail screen
- [x] Nice to have: profile, push notifications
- [x] Local demo ready on the Android emulator (development build installed)
- [ ] Optional: standalone release APK (not built; the demo runs on the emulator)
- [ ] Known issue: production worker on Render not running (local demo unaffected)
