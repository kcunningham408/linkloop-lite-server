# LinkLoop Lite — App Store Submission Notes

This document collects values and instructions you can copy into App Store Connect when you create the app and submit builds. It also includes steps we prepared in the repo to help with review (demo account seed, env example, and build hints).

--

Basic app values (from `app.json`)
- App name: LinkLoop Lite
- Bundle identifier: com.vibecmd.linklooplite
- Version: 1.0.0

Suggested SKU: linkloop-lite-001

Owner: kcunningham408

Description (short): Lightweight T1D glucose tracking with Care Circle sharing and AI-powered insights.

Support / Privacy / Terms URLs (server hosts static pages)
- Support URL: https://linkloop-lite-server.onrender.com/support
- Privacy Policy URL: https://linkloop-lite-server.onrender.com/privacy
- Terms URL: https://linkloop-lite-server.onrender.com/terms

If you don't yet have a deployed server, you can deploy `LinkLoopLiteServer/` (it serves the static pages in `public/`) or host the files elsewhere and update the URLs in App Store Connect.

Demo/Test Account for App Review
- We added a seeding script at `LinkLoopLiteServer/seedDemoUser.js` which reads `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` from environment variables (see `.env.example`).
- Defaults used by the script:
  - email: demo@linkloop.test
  - password: DemoPass123!

Instructions for reviewers (example):
- Email: demo@linkloop.test
- Password: DemoPass123!
- Steps to exercise core flows: sign in → check Home → CGM → Care Circle → Insights → Profile

EAS build / submit notes
- `eas.json` exists in the project. Before automated submit, fill these fields in `LinkLoopLiteApp/eas.json` under `submit.production.ios`:
  - `appleId`: your Apple ID email (already set to `kcunningham408@gmail.com` in the file)
  - `ascAppId`: App Store Connect App ID (you get this after creating the app record in App Store Connect)
  - `appleTeamId`: your Apple Developer Team ID

Recommended EAS commands (once Apple account is configured):
```bash
# build (production profile)
eas build -p ios --profile production

# submit to App Store Connect
eas submit -p ios --profile production
```

Local dev / review steps
1. Set up server env: copy `LinkLoopLiteServer/.env.example` → `LinkLoopLiteServer/.env` and fill values.
2. Start MongoDB (locally or use a remote connection in `MONGODB_URI`).
3. Seed demo user (optional):
```bash
cd LinkLoopLiteServer
node seedDemoUser.js
```
4. Start server:
```bash
npm run dev
```
5. Start the app (in app folder):
```bash
cd ../LinkLoopLiteApp
npm install
expo start
```

Privacy & Data Collection (draft answers for App Store Connect)
- Data collected: Email or phone (account creation), user name, profile emoji, settings, and glucose readings (user-generated health data). Auth tokens are stored locally on the device (AsyncStorage) to maintain sessions.
- Data use: To provide app functionality: user authentication, storing and retrieving glucose readings, sharing with care circle members, and generating insights.
- Third-party services: Expo and related React Native libraries (see `package.json`). No analytics SDKs are included by default.
- Export Compliance: `ITSAppUsesNonExemptEncryption` is set to `false` in `app.json` → you claim no non-exempt encryption.

App Review notes to include when submitting:
- Provide demo credentials (above).
- Provide the URL to the privacy policy (see above) and confirm the app requires login.
- If you expect Apple to need additional access (e.g., HealthKit), add notes here (currently none).

Further actions you can ask me to do
- Fill `eas.json` placeholders with your Team ID and ASC App ID (when you have them).
- Add a small script to deploy `LinkLoopLiteServer` to a hosting provider and point privacy/support URLs to it.
- Create screenshot templates and a checklist for capturing required device sizes.

--

File locations created/updated by me:
- `LinkLoopLiteServer/.env.example` — example env file
- `LinkLoopLiteServer/seedDemoUser.js` — simple node script to seed/update a demo user
- `LinkLoopLiteApp/APP_STORE_SUBMISSION.md` — this document
