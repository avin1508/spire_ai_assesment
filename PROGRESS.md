# Progress

**Current phase:** Phase 1: Navigation and Opportunities screen UI, restyled to match the reference (waiting for review)
**Current prompt:** #6
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

### In progress
- [ ] Review of the restyled UI and swipe navigation (Prompts #4 and #5)

### Pending
- [ ] Commit of the Prompt #3 and #4 changes. Prompt #3 files are staged by the user; Prompt #4 edits are unstaged.
- [ ] MongoDB connection and data models
- [ ] Auth (Login/Signup)
- [ ] Seeded jobs, jobs list API with search
- [ ] Jobs list view content, Job detail screen
- [ ] Real map integration
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
| — | iOS device or simulator | **Not tested** (no macOS available) |
| — | Physical Android device | **Not tested** |
| — | Linting | **Not available**: no ESLint config in the project; none added to avoid extra dependencies |

## Known issues
- The reference screenshot arrived with Prompt #4, and the UI was restyled to match it. Positions are estimates; it is not a pixel-perfect match.
- Jobs tab swipe is enabled on All Jobs. The map is static now, so there is no gesture conflict. When a real map is added, disable swipe on All Jobs or limit it to non-map areas.
- The mock company names (Kotak Mahindra, Accenture) and job count (186445) were taken from the reference screenshot and are placeholders.
- Header buttons, map controls, Agent Sigma, and View Companies / View Jobs don't do anything yet (UI only). Search input and filter chips only update local state.
- The map is a static, locally drawn illustration. Marker positions are mock percentages, not real coordinates.
- The Expo template added `frontend/AGENTS.md` and `frontend/.claude/settings.json`. `AGENTS.md` recommends Expo Router and TypeScript checks, which don't match this project (React Navigation, JavaScript only). Both files have been kept for now.
- `npm install` in `frontend/` reports `npm audit` warnings in transitive dependencies. They have not been fixed, because `audit fix --force` could break SDK version pins.

## Remaining assessment deliverables
- [ ] Source repository with regular Git commits (3 commits so far; Prompt #3 changes not yet committed)
- [ ] README with setup, technology choices, completed and missing features (keep updated)
- [x] AI notes with tools, key prompts and one genuine AI mistake that was corrected (keep updating)
- [ ] Working demo on a device or emulator (the UI runs on an Android emulator; core features still missing)
- [ ] Ability to explain the code
- [ ] Ability to make a small live change during the demo
