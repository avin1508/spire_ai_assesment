# Spire.AI iExchange Clone

Practical assessment project: a job-matching mobile app. Users can upload a resume (as a guest or with an account), get AI-based job recommendations, browse and search jobs, and track saved and applied jobs.

> **Status:** Phase 1 (navigation and Opportunities screen UI) is done and waiting for review. The UI uses only local mock data; there is no backend integration yet. See [PROGRESS.md](PROGRESS.md).

## Tech stack

| Layer | Technology | Status |
| --- | --- | --- |
| Mobile frontend | React Native + Expo (SDK 58), JavaScript only | Navigation + Opportunities UI |
| Navigation | React Navigation 7: bottom tabs for the main app; material top tabs (`react-native-tab-view` + `react-native-pager-view`) for the swipeable Jobs tabs | Done |
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
│   ├── App.js                 # SafeAreaProvider + NavigationContainer
│   ├── index.js
│   ├── app.json
│   ├── assets/
│   └── src/
│       ├── theme.js           # colors, spacing, radius, typography
│       ├── navigation/        # RootNavigator (main tabs), JobsNavigator (nested tabs)
│       ├── screens/           # OpportunitiesScreen, PlaceholderScreen
│       ├── components/        # AppHeader, JobsTabBar, LocationSearchBar, FilterChip,
│       │                      # MapPlaceholder, MapControls, AgentSigmaButton, BottomActionBar
│       └── data/mockMap.js    # local mock cities, markers and counts
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

## API

| Method | Path | Response |
| --- | --- | --- |
| GET | `/health` | `{ "status": "ok" }` |

## Testing

There are no automated tests yet. Static checks:

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
- Nested Jobs tabs: Recommended, All Jobs (default), Saved, Applied (all except All Jobs are placeholders). You can switch tabs by tapping or by swiping horizontally.
- Opportunities screen UI (All Jobs), styled to match the iExchange reference. It has a header (Upload Resume, Share, notifications), scrollable job tabs with counts, a location search pill with a list/map toggle, and filter chips (Recommended, Verified, Last 24 hours). The map is a static illustration with state borders, region and city labels, job pins and company callouts. It also has zoom and locate controls, the Agent Sigma button, and View companies / View jobs buttons.
  - These are **UI only**: the buttons do nothing yet, the search doesn't filter, and the map is a locally drawn illustration, not a real map.

### Missing (planned)
- Real map integration and list view content
- Login / Signup and Profile
- Guest mode and resume upload
- Resume parsing and profile auto-fill
- AI-based job recommendations (Gemini)
- All Jobs: seeded jobs, search, map and list views
- Recommended, Saved and Applied tabs
- Job detail screen
- Linking guest data to an account
- Resume re-upload with refreshed recommendations
- Agent Sigma: basic AI interaction
- Background resume processing (BullMQ + Redis)
- In-app notifications and FCM push notifications

## AI usage

All AI-assisted work is logged in [AI_NOTES.md](AI_NOTES.md).
