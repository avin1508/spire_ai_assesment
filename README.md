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
| Database | MongoDB | Not started |
| AI | Gemini API | Not started |
| Background jobs | BullMQ + Redis | Not started |
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
│       └── data/              # mockMap.js (All Jobs map), mockRecommendations.js (sample recommended jobs)
├── backend/           # Express API
│   ├── src/server.js
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
cp .env.example .env   # optional for now; PORT defaults to 5000
npm run dev            # start with nodemon (auto-reload)
# or
npm start              # start with node
```

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

More variables (MongoDB URI, Gemini key, Redis URL, Firebase credentials) will be added as those features are built.

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
| GET | `/health` | `{ "status": "ok" }` |

## Testing

Unit tests (guest storage, start-up restore and profile-merge logic; Node's built-in test runner, no extra packages):

```bash
cd frontend
npm test
```

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
# expected: {"status":"ok"}

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
- Opportunities screen UI (All Jobs), styled to match the iExchange reference. It has a header (Upload Resume, Share, notifications), scrollable job tabs with counts, a location search pill with a list/map toggle, and filter chips (Recommended, Verified, Last 24 hours). The map is a static illustration with state borders, region and city labels, job pins and company callouts. It also has zoom and locate controls, the Agent Sigma button, and View companies / View jobs buttons.
  - These are **UI only**: the buttons do nothing yet, the search doesn't filter, and the map is a locally drawn illustration, not a real map.

### Missing (planned)
- Completing Google sign-in: the login sheet and Google flow are built, but the backend token check and session are still needed
- Production map tile provider
- Resume upload to the backend, real parsing and profile auto-fill (UI ready and simulated; backend missing)
- AI-based job recommendations (Gemini) (UI ready, showing mock jobs; backend missing)
- All Jobs: seeded jobs, search, map and list views
- Saved and Applied tabs
- Opening Job Details from All Jobs (needs an All Jobs job list); saving and emailing jobs
- Linking guest data to an account
- Resume re-upload with refreshed recommendations
- Agent Sigma: basic AI interaction
- Background resume processing (BullMQ + Redis)
- In-app notifications and FCM push notifications

## AI usage

All AI-assisted work is logged in [AI_NOTES.md](AI_NOTES.md).
