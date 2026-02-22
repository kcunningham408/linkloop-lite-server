# LinkLoop Lite — Monorepo

This repository contains two main parts:

- `LinkLoopLiteApp/` — Expo React Native app (mobile client)
- `LinkLoopLiteServer/` — Express + MongoDB backend (API + static pages)

Purpose: Prepare the project for iOS App Store submission and local testing.

Quick start (local)
1. Server
```bash
cd LinkLoopLiteServer
cp .env.example .env
# Edit .env to set MONGODB_URI and JWT_SECRET
npm install
npm run seed:demo   # creates/updates demo user
npm run dev         # start server with nodemon
```

2. App (local testing)
```bash
cd ../LinkLoopLiteApp
npm install
# Edit LinkLoopLiteApp/config/api.js to point to local server for testing if needed:
# const API_URL = 'http://localhost:5000/api';
expo start
```

Files added to help submission and testing
- `LinkLoopLiteServer/.env.example` — example env file
- `LinkLoopLiteServer/seedDemoUser.js` — seed script for a demo reviewer account
- `LinkLoopLiteApp/APP_STORE_SUBMISSION.md` — App Store submission notes and checklist
- `LinkLoopLiteApp/ScreenshotChecklist.md` — screenshot guidance

If you want, I can continue with filling `eas.json` placeholders when you have your Apple Team ID.
