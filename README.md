# Spire.AI iExchange Clone

Practical assessment project: a job-matching mobile app. Users can upload a resume (as a guest or with an account), get AI-based job recommendations, browse and search jobs, and track saved and applied jobs.

> **Status:** Phase 2 (UI development) in progress. The Recommended jobs UI and the resume → profile → recommendations flow are built, waiting for review. Resume parsing and job matching are not connected yet (no backend integration), so those steps show honest "not available yet" states. See [PROGRESS.md](PROGRESS.md).

## Tech stack

| Layer | Technology | Status |
| --- | --- | --- |
| Mobile frontend | React Native + Expo (SDK 58), JavaScript only | Opportunities, Recommended and resume-flow UI |
| Navigation | React Navigation 7: native stack for full-screen flows; bottom tabs for the main app; material top tabs (`react-native-tab-view` + `react-native-pager-view`) for the swipeable Jobs tabs | Done |
| State management | Redux Toolkit + React Redux (`src/store/`) | Done |
| File picking | `expo-document-picker` (PDF / Word resumes) | Done |
| Icons | `@expo/vector-icons` (Ionicons) + `expo-font` | Done |
| Backend API | Node.js + Express 5, JavaScript ES modules | Initialized |
| Database | MongoDB Atlas + Mongoose 9 | `Job` model (`src/models/job.model.js`); 500 demo jobs seeded |
| AI | Gemini API | Not started |
| Background jobs | BullMQ + Redis | Redis runs in Docker Compose and the backend connects to it; BullMQ not started |
| Push notifications | Firebase Cloud Messaging (FCM) | Not started |

The project uses JavaScript only, with no TypeScript.

## Project structure

```
spire_ai/
├── frontend/          # Expo app (JavaScript)
│   ├── App.js                 # providers (safe area, Redux store) + NavigationContainer
│   ├── index.js
│   ├── app.json
│   ├── assets/                # icons + recommended-jobs-hero.png illustration
│   └── src/
│       ├── theme.js           # colors, spacing, radius, typography
│       ├── navigation/        # AppNavigator (stack), RootNavigator (main tabs), JobsNavigator (nested tabs)
│       ├── screens/           # Opportunities, Recommended, ResumeConfirm, ProfileProcessing,
│       │                      # ProfileConfirm, Placeholder
│       ├── components/        # AppHeader, JobsTabBar, JobCard, RecommendedLanding, RecommendationStatus,
│       │                      # SearchField, FilterChip, Button, map components, ...
│       ├── store/             # Redux Toolkit: session slice (guest / signed-in), profile slice (resume, profile, recommendations)
│       ├── services/          # resumeService (not connected yet), recommendationService (returns MOCK jobs for now)
│       ├── hooks/             # useResumeUpload
│       ├── utils/             # pickResume, format helpers
│       ├── config/            # api.js (backend URL), map.js, auth.js
│       └── data/              # mockMap.js (chip constants), mockRecommendations.js (sample recommended jobs)
├── backend/           # Express API
│   ├── src/
│   │   ├── server.js          # loads .env, connects to MongoDB (and Redis if configured), then listens
│   │   ├── app.js             # Express app: /health, /api/jobs, JSON errors
│   │   ├── routes/            # jobs.routes.js (All Jobs API)
│   │   ├── services/          # jobQuery.js (validation + shared filter), jobs.service.js (queries, map clustering)
│   │   ├── utils/             # httpErrors.js, geo.js
│   │   ├── config/            # env.js (reads env vars), db.js (MongoDB), redis.js (Redis client)
│   │   ├── models/            # job.model.js (Job schema, enums, indexes)
│   │   ├── data/              # 500-job demo dataset: cities.js, companies.js, roles.js, jobs.dataset.js
│   │   ├── seed/              # jobTransform.js (validation, DB document ↔ frontend job shape)
│   │   └── scripts/           # seedJobs.js
│   ├── tests/                 # node --test
│   ├── Dockerfile.dev         # development image (all deps, nodemon auto-reload)
│   ├── Dockerfile.prod        # production image (multi-stage, production deps only, non-root, health check)
│   ├── docker-compose.yml     # development: backend + Redis (project name: spire-ai)
│   ├── docker-compose.prod.yml  # production: backend + password-protected, persistent Redis (project: spire-ai-prod)
│   ├── .dockerignore          # keeps .env, node_modules and tests out of the image
│   ├── .env.example
│   └── package.json
├── AI_NOTES.md        # Log of AI-assisted prompts
├── PROGRESS.md        # Scope, phase and task tracking
└── README.md
```

## Requirements

- Node.js 20+ (developed on Node 22.21.1) and npm 10+
- The Expo Go app on an Android or iOS device, or an Android emulator / iOS simulator

## Installation and running

The frontend and backend are installed and run separately.

### Backend (`backend/`)

```bash
cd backend
npm install
cp .env.example .env   # then fill in the DB_* values (required: the server won't start without a database)
npm run dev            # start with nodemon (auto-reload)
# or
npm start              # start with node
```

### Backend with Docker — development (backend + Redis)

You need Docker Desktop running. Redis doesn't need to be installed on Windows; it runs from the official `redis:8.2.10-alpine` image. The development image runs nodemon, and `./src` is mounted, so code changes restart the server without a rebuild.

```bash
cd backend
cp .env.example .env              # fill in the DB_* values (MongoDB stays on Atlas)
docker compose up --build -d      # builds the API image, starts Redis, then the API once Redis is healthy
docker compose ps                 # both services should show (healthy)
curl http://localhost:5000/health # {"status":"ok","database":"connected","redis":"connected"}
docker compose logs -f backend    # follow the API logs
docker compose down               # stop and remove the containers
```

- In Compose, the backend reaches Redis at `redis://redis:6379`, using the service name, not `localhost`.
- Redis is also published on `127.0.0.1:6379` only. To use it from `npm run dev` on the host, run `docker compose up -d redis` and set `REDIS_URL=redis://localhost:6379` in `.env`.
- **Ports:** if port 5000 is already in use (for example by `npm run dev`), choose another host port.
  - Git Bash: `BACKEND_HOST_PORT=5080 docker compose up -d`
  - PowerShell: `$env:BACKEND_HOST_PORT=5080; docker compose up -d`
  - `REDIS_HOST_PORT` works the same way for Redis.
- **Secrets:** `.env` is never copied into the image. Compose passes it to the container at runtime with `env_file`.

### Backend with Docker — production

`docker-compose.prod.yml` builds `Dockerfile.prod`: a multi-stage build with production dependencies only, running as the non-root `node` user, with a built-in health check. It uses a separate project name (`spire-ai-prod`), so it never replaces the development containers. It also needs `REDIS_PASSWORD` in `backend/.env`, made of letters and digits only (for example `openssl rand -hex 32`); Compose refuses to start without it.

```bash
cd backend
docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml ps        # both (healthy)
curl http://localhost:5000/health
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml down      # keeps Redis data; add -v to delete it
```

| | Development (`docker-compose.yml`) | Production (`docker-compose.prod.yml`) |
| --- | --- | --- |
| Image | `Dockerfile.dev`: all deps, nodemon | `Dockerfile.prod`: multi-stage, production deps only |
| Source code | `./src` mounted, auto-reload | Baked into the image; read-only filesystem |
| Redis access | Published on `127.0.0.1:6379`, no password | Not published; password required (`REDIS_PASSWORD`) |
| Redis data | Not persisted | Named volume `redis-data`, append-only file |
| Restart policy | `unless-stopped` | `always` |
| Limits and logs | None | Memory limits (backend 512 MB, Redis 256 MB); log rotation 3 × 10 MB |

This is a single-host production setup. There is no HTTPS or reverse proxy yet: put one (for example nginx or a cloud load balancer) in front of port 5000 before exposing it to the internet.

### Frontend (`frontend/`)

```bash
cd frontend
npm install
npm start              # Expo dev server; scan the QR code with Expo Go
npm run android        # open on an Android device or emulator
npm run ios            # open on iOS (needs macOS)
npm run web            # open in the browser
```

## Environment variables

Backend variables live in `backend/.env`. Copy them from [backend/.env.example](backend/.env.example). `.env` files are git-ignored.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5000` | Port the Express server listens on |
| `DB_USERNAME` | — | MongoDB Atlas database user |
| `DB_PASSWORD` | — | Its password (URL-encoded automatically; never logged) |
| `DB_CLUSTER_URL` | — | Atlas cluster host, e.g. `cluster0.xxxxx.mongodb.net` |
| `DB_NAME` | — | Database name (`spire_db`) |
| `REDIS_URL` | empty | Optional. Empty means the server runs without Redis. When it's set, the server won't start unless Redis answers. Compose sets it to `redis://redis:6379` (with the password in production) |
| `REDIS_PASSWORD` | — | Production Compose only: the Redis password (letters and digits only) |

More variables (Gemini key, Firebase credentials) will be added as those features are built.

**Backend address for the frontend:** `EXPO_PUBLIC_API_URL` in `frontend/.env`. Without it, the app uses port 5000 on the computer running the Expo dev server. That's the same LAN address the phone loaded the app from, so a physical phone on the same Wi-Fi works with no setup. `localhost` becomes `10.0.2.2` on the Android emulator. Set the variable for tunnel mode, or when the backend runs on another machine. The phone must be able to reach port 5000 (same network, and allowed by the firewall).

### Seeding the jobs

`src/data/jobs.dataset.js` builds 500 demonstration jobs, all fictional companies and marked `isDemo: true`. They cover 7 categories (Frontend, Backend, Full Stack, Mobile, Data, Cloud & DevOps, QA & Testing) across 17 Indian cities, with coordinates in real business districts. The dataset is deterministic, so every run produces the same jobIds and content. Load it into `spire_db.jobs` with:

```bash
cd backend
npm run seed:jobs -- --dry-run   # show how existing documents map onto the dataset; writes nothing
npm run seed:jobs                # upsert by jobId
npm test                         # dataset, schema, transform and seed tests
```

The seed runs only when you run `npm run seed:jobs` yourself. It doesn't run on server start (`npm start` / `npm run dev`), `npm install` or `npm test`. Run it again only after changing `src/data/` or when the database is empty.

The seed is safe to re-run. It validates every record first and writes nothing if any record is invalid or the count isn't 500. It upserts by `jobId` and never deletes or drops anything; documents that aren't in the dataset are left alone and listed. `postedAt` is set only on first insert, and a second run reports `unchanged: 500`.

The All Jobs tab reads these jobs through the API below. `toJobCard()` and `toFrontendJob()` in `src/seed/jobTransform.js` convert documents into the fields the app uses (`id`, `company`, `location`, `salary` text, `description` with sections).

Frontend variables live in `frontend/.env`. Copy them from [frontend/.env.example](frontend/.env.example), then restart Expo. They're bundled into the app, so only public identifiers go here.

| Variable | Description |
| --- | --- |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google OAuth client ID for Android (package `com.spireai.iexchange` + your signing SHA-1) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google OAuth client ID for iOS (bundle id `com.spireai.iexchange`) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Web client ID (also the audience the backend checks) |
| `EXPO_PUBLIC_MAP_TILE_URL` / `EXPO_PUBLIC_MAP_ATTRIBUTION` | Optional map tile provider. The public OpenStreetMap default is for development only. |

Google sign-in doesn't work in Expo Go. It needs a development build or APK (`npx expo run:android`, or an EAS build) with the client IDs set. Even then, sign-in only finishes once the backend `POST /api/auth/google` exists to verify the token.

## API

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | `200 { "status": "ok", "database": "connected", "redis": "connected" }` (`redis` is `"not_configured"` without `REDIS_URL`), or `503 { "status": "degraded", … }` when MongoDB or a configured Redis isn't connected |
| GET | `/api/jobs` | List page: `{ items, page, limit, total, hasMore }`. Takes `page` (1–500), `limit` (1–50, default 20), `sort=recommended|newest|distance` (distance needs `lat`/`lng`) and `lat`/`lng` (adds `distanceKm`) |
| GET | `/api/jobs/map` | Map markers for `bbox=west,south,east,north` and `zoom` (0–20): `{ zoom, total, clusters: [{ id, latitude, longitude, count, officeCount, companyCount, bounds }], offices: [{ id, latitude, longitude, count, companyName, area, city, bounds, jobId? }] }` |
| GET | `/api/jobs/summary` | `{ total, bounds }` for the filters (bounds is `null` when nothing matches) |
| GET | `/api/jobs/filter-options` | Values and counts per All Filters section, for the jobs matching the given filters |
| POST | `/api/resumes` | Upload a resume (multipart field `file`, PDF/DOCX ≤ 5 MB, header `X-Guest-Session`, optional `Idempotency-Key`) → `202 { jobId, status: "queued", pollAfterMs, file }`. 401 without a guest session, 413 too large, 415 not PDF/DOCX (checked by content), 503 queue unavailable |
| GET | `/api/resumes/jobs/:jobId` | Processing status: `{ status: queued|processing|completed|failed, stage, profile (when completed), error { code, message, retryable }, pollAfterMs }`. Another guest's job → 404 |
| POST | `/api/resumes/jobs/:jobId/retry` | Re-queue a failed, retryable job (409 if not retryable) |
| POST | `/api/resumes/:resumeId/confirm` | Make it the guest's resume after the profile is saved; the previous resume is deleted |
| GET | `/api/resumes/:resumeId/download` | The guest's confirmed resume file (owner only, `Cache-Control: private, no-store`) |
| POST | `/api/recommendations` | `{ matchingProfile }` (skills, role, job titles, experience, locations, degree/field only; anything else is dropped) → `202` new run or `200` existing `{ recommendationId, profileVersion, status, pollAfterMs, … }` |
| GET | `/api/recommendations/current` | Current status: `queued / processing / deferred / completed / failed` (or `{ status: "none" }`); `items` (real jobs + `fitLabel`, `matchedSkills`, `gapSkills`, `reason`) only when completed |
| POST | `/api/recommendations/:id/retry` | Re-schedule a failed, retryable run |
| POST | `/api/auth/register` | `{ name, email, password }` → `201 { user, token, expiresAt }`; 409 `email_taken` |
| POST | `/api/auth/login` | `{ email, password }` → `{ user, token, expiresAt }`; 401 `invalid_credentials` (same for unknown email); rate limited (429) |
| POST | `/api/auth/logout` | Bearer → `204`, the session is revoked |
| GET | `/api/auth/me` | Bearer → `{ user }` |
| POST | `/api/auth/link-guest` | Bearer + `X-Guest-Session` → links that guest's profile / resume / recommendations to the account (idempotent; one account per guest session) |
| GET / PUT | `/api/profile` | The owner's complete profile; PUT `{ profile, baseRevision }`, 409 `profile_conflict` if the server copy is newer |

Resume and recommendation endpoints accept either `Authorization: Bearer <token>` (signed-in user) or `X-Guest-Session` (guest). An invalid token is rejected with 401, never treated as a guest.
| GET | `/api/jobs/:jobId` | The full job, including the description; 400 for a malformed id, 404 if it doesn't exist |

**Shared filters** (the same meaning on every endpoint):
- `q`: up to 100 characters. It matches title, company, area, city, state and skills; the text is matched literally (case-insensitive substring), never as a regex.
- `country`, `location` (city), `state`, `company`, `title`, `experience`: repeat the parameter for several values.
- `aging=24h|7d|30d`, `verified=true`, `last24h=true`.
- `bbox`: a map area.

**Errors:** `400 { error: "invalid_request", details: [{ param, message }] }` for invalid or unknown parameters, `404`, and `503 { error: "service_unavailable" }` when the database is down or slow (each query has an 8 s limit).

**Map markers:** grouped in MongoDB.
- Jobs inside the `bbox` are matched exactly on latitude/longitude, plus a `$geoWithin` polygon so the 2dsphere index is used.
- They are grouped into company offices (same company, area and city), then into grid cells of about 64 screen pixels at the requested zoom.
- **One office in a cell:** an *office* marker, drawn as a white bubble with a briefcase, the job count and the company name. A one-job office carries `jobId`, and tapping it opens the job.
- **Several offices in a cell:** a *cluster*, drawn as a blue numbered pin showing how many offices it holds. Zooming in splits it into smaller pins and company bubbles.
- **Exact lists:** every marker has the exact bounds of its jobs. Listing with `bbox` = bounds (plus `company` for an office) returns exactly its jobs.

## Testing

Unit tests use Node's built-in test runner, with no extra packages:

```bash
cd frontend && npm test   # All Jobs loading/shimmer rules, stale responses, infinite-scroll paging, API params
cd backend && npm test    # dataset, schema, seed, Redis config, and All Jobs API integration tests
```

The backend API tests run against an in-memory MongoDB (`mongodb-memory-server`, a dev dependency) loaded with the 500-job dataset; Atlas is never touched. The first run downloads a MongoDB binary.

```bash
```

Uploading a new resume replaces the skills, role and experience taken from the previous resume (it may be a different person's); entries added by hand are kept. Skill spellings are normalised when matching ("React.js" = "React").

Guest data (profile, skills, experience, education, resume details) is saved on the device in AsyncStorage under a guest-only namespace (`spire:guest:*`). The resume file is copied into the app's private document folder, so both survive restarts.

Static checks:

```bash
cd frontend
npx expo-doctor                                   # dependency/config checks
npx expo export --platform android --output-dir <tmp-dir>   # full Android bundle build
```

Manual checks:

```bash
# Backend: start the server, then:
curl http://localhost:5000/health
# expected: {"status":"ok","database":"connected","redis":"not_configured"}  (or "connected" with REDIS_URL / Docker)

# Frontend: start Expo, then check the bundle builds:
cd frontend && npm start
# open in Expo Go, or visit http://localhost:8081/status (expected: packager-status:running)
```

## Features

### Completed
- Project initialization: Expo frontend, Express backend, `/health` endpoint.
- Main bottom tabs: Jobs, Skills, Learning, Profile (Skills, Learning and Profile are placeholders).
- Nested Jobs tabs: Recommended, All Jobs (default), Saved, Applied (Saved and Applied are placeholders). You can switch tabs by tapping or by swiping horizontally.
- Recommended tab and resume flow (UI):
  - Guest landing with the Agent Sigma illustration, Upload Resume and Sign Up to Explore More.
  - Resume picker (PDF/Word) → "Is this the correct resume?" confirmation with file name and size (reusable for later updates).
  - "Building Your Profile" processing screen; when parsing isn't available it says so and offers manual entry.
  - Editable profile form (name, email, phone, WhatsApp opt-in, role, current/preferred locations, experience, company) with validation.
  - Recommendation states: loading ("Agent Sigma is on the hunt"), no matches, not available yet (with retry), and the job list.
  - Search plus filters: a Sort sheet (Recommended, Aging, Fitment; Distance stays disabled until location data exists), an All Filters sheet (Country, Location, Company, Experience, Job Title, Aging, State, with search, multi-select, counts, Clear all and Show N jobs), and Verified / Last 24 hours chips. The tab count follows the filtered list.
  - Job cards: title, company, verified badge, fit label, location, posting age, matched skills, skill gaps with a Learning entry point, share and save. Guests see locked save/learning actions that prompt sign-up.
  - Job Details: tap a job card to open it. Shows the job summary, Exact Match / Gaps skill chips (gaps link to Learning), the formatted description and a fixed "Apply on company site" button. Guests see locked email / save / apply actions that prompt sign-up; signed-in users can open the apply link.
  - Header adapts to the session: Upload Resume (guest without profile), Sign up (guest with profile), share + notifications (signed in).
  - **Not connected yet:** sign-in, and saving the profile beyond the current app session.
  - **Simulated:** resume parsing returns the same fictional sample profile after 3 seconds (`src/data/mockResume.js`).
- Profile tab: profile card (initials avatar, contact details, role, locations, experience), a resume card (replace runs the resume flow again and returns to Profile), and Experience and Education sections. The + / ✎ icons on the Profile screen are display-only. "Show all experiences" opens the full list, which has edit mode, add and edit forms with validation, and delete.
  - **Mock data:** the recommended jobs are 5 hardcoded sample jobs (`src/data/mockRecommendations.js`), the same for every profile. They are not AI matches.
- **All Jobs, backed by the API and MongoDB (500 seeded demo jobs):**
  - **Map:** a Leaflet map with clusters and markers from the backend for the visible area. Tapping a cluster shows "N jobs in this area · M companies" with Zoom in / View list; tapping a marker shows the job preview.
  - **List:** infinite scroll, 20 jobs per page.
  - **Search and filters:** search, Verified and Last 24 hours chips, and the All Filters sheet with real counts.
  - **Sort:** Recommended / Newest / Distance. "Recommended" is newest-first until AI ranking exists.
  - **Other:** View companies, and Job Details loaded by id.
  - **Loading:** skeleton shimmer while the map loads (reference style), shimmer cards while the list loads the next page, and error + retry states.

### Missing (planned)
- Completing Google sign-in: the login sheet and Google flow are built, but the backend token check and session are still needed
- Production map tile provider
- Resume upload to the backend, real parsing and profile auto-fill (UI ready and simulated; backend missing)
- AI-based job recommendations (Gemini) (UI ready, showing mock jobs; backend missing)
- Saved and Applied tabs
- Saving and emailing jobs
- Linking guest data to an account
- Resume re-upload with refreshed recommendations
- Agent Sigma: basic AI interaction
- Background resume processing (BullMQ + Redis)
- In-app notifications and FCM push notifications

## AI usage

All AI-assisted work is logged in [AI_NOTES.md](AI_NOTES.md).
