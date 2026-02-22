# LinkLoop Lite Server — README

This is the Express + MongoDB backend for LinkLoop Lite. It serves API endpoints for authentication, users, glucose readings, care-circle features, and static pages (privacy/support/terms).

Local development
1. Copy environment example and set secure values:
```bash
cd LinkLoopLiteServer
cp .env.example .env
# Edit .env and set MONGODB_URI and JWT_SECRET
```

2. Install dependencies and seed demo user (optional):
```bash
npm install
npm run seed:demo
# -> prints demo credentials
```

3. Run server (development):
```bash
npm run dev
# default: listens on PORT from .env (5000 if not set)
```

Seed script
- `seedDemoUser.js` will create or update a demo user using `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` from your `.env` (or defaults in `.env.example`).

Notes for App Store submission
- The server includes static privacy/support pages in `public/`. Deploy the server to make those URLs public and include them in App Store Connect.

Deployment guide (Render) available: `DEPLOY_RENDER.md` (instructions and sample `render.yaml` are included in the repo already).
