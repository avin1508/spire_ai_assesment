# Spire AI

Monorepo with a React Native (Expo) frontend and a Node.js (Express) backend.

## Requirements

- Node.js 20+ and npm
- Expo Go app on a device, or an Android/iOS emulator (optional, for running the app)

## Frontend (`frontend/`)

```bash
cd frontend
npm install
npm start          # Expo dev server (scan the QR code with Expo Go)
npm run android    # open on Android
npm run ios        # open on iOS (macOS only)
npm run web        # open in the browser
```

## Backend (`backend/`)

```bash
cd backend
npm install
cp .env.example .env   # optional; PORT defaults to 5000
npm run dev            # start with nodemon (auto-reload)
npm start              # start with node
```

Health check:

```bash
curl http://localhost:5000/health
# {"status":"ok"}
```
