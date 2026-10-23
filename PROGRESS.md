# Progress

**Current phase:** Phase 0: Project initialization (waiting for review)
**Current prompt:** #2
**Last updated:** 2026-10-24

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

**Locked stack:** React Native + Expo (JavaScript), Node.js + Express (ES modules), MongoDB, Gemini, BullMQ + Redis, FCM. No TypeScript.

## Tasks

### Completed
- [x] Expo blank JavaScript project in `frontend/` (Prompt #1)
- [x] Express backend in `backend/` with `GET /health` (Prompt #1)
- [x] Backend `.env.example`, root `.gitignore`, README (Prompt #1)
- [x] Tracking files `AI_NOTES.md` and `PROGRESS.md`; README expanded (Prompt #2)

### In progress
- [ ] Review of Phase 0 initialization

### Pending
- [ ] Initial Git commit of the setup (waiting for approval)
- [ ] MongoDB connection and data models
- [ ] Auth (Login/Signup)
- [ ] Seeded jobs, jobs list API with search
- [ ] Frontend screens: jobs list, job detail, login, profile
- [ ] All other target features listed above

## Test results

| Date | Check | Result |
| --- | --- | --- |
| 2026-10-24 | Backend `npm start` + `curl /health` | Passed: `{"status":"ok"}` |
| 2026-10-24 | Backend `npm run dev` (nodemon, PORT=5055) + `curl /health` | Passed: `{"status":"ok"}` |
| 2026-10-24 | Expo `CI=1 npx expo start`, `/status` + Android bundle request | Passed: `packager-status:running`, HTTP 200, 744 modules |
| 2026-10-24 | App opened on a physical device or emulator | **Not done yet** |

## Known issues
- A tracked file `temp` (from the first commit) appears as deleted in `git status`. It was deleted before AI work started and has been left alone.
- The Expo template added `frontend/AGENTS.md` and `frontend/.claude/settings.json`. `AGENTS.md` recommends Expo Router and TypeScript checks, which do not match this project's JavaScript-only setup. Both files have been kept for now.
- `npm install` in `frontend/` reports `npm audit` warnings in Expo's dependencies. They have not been fixed, because `audit fix --force` could break SDK version pins.

## Remaining assessment deliverables
- [ ] Source repository with regular Git commits (only the initial `first commit` exists so far)
- [ ] README with setup, technology choices, completed and missing features (started; keep updated)
- [ ] AI notes with tools, key prompts and one genuine AI mistake that was corrected (started)
- [ ] Working demo on a device or emulator
- [ ] Ability to explain the code
- [ ] Ability to make a small live change during the demo
