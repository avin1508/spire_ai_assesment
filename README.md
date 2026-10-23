# Spire.AI iExchange Clone

Practical assessment project: a job-matching mobile app. Users can upload a resume (as a guest or with an account), get AI-based job recommendations, browse and search jobs, and track saved and applied jobs.

> **Status:** Phase 0 (project initialization) is done. No app features are built yet. See [PROGRESS.md](PROGRESS.md).

## Tech stack

| Layer | Technology | Status |
| --- | --- | --- |
| Mobile frontend | React Native + Expo (SDK 58), JavaScript only | Initialized |
| Backend API | Node.js + Express 5, JavaScript ES modules | Initialized |
| Database | MongoDB | Not started |
| AI | Gemini API | Not started |
| Background jobs | BullMQ + Redis | Not started |
| Push notifications | Firebase Cloud Messaging (FCM) | Not started |

The project uses JavaScript only, with no TypeScript.

## Project structure

```
spire_ai/
├── frontend/          # Expo app (blank JavaScript template)
│   ├── App.js
│   ├── index.js
│   ├── app.json
│   └── assets/
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

There are no automated tests yet. Manual checks:

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

### Missing (planned)
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
