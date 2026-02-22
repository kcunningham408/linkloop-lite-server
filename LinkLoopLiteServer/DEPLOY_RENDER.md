# Deploying LinkLoop Lite Server to Render

This guide shows a simple way to deploy the `LinkLoopLiteServer` to Render (https://render.com). Render can run a Node web service and provides a public URL you can use for App Store privacy/support links.

1) Create a Render account and new Web Service
- Connect your GitHub repo and choose the `LinkLoopLiteServer` folder as the service root (Render can detect monorepos).

2) Build & start command
- Build command: `npm install`
- Start command: `npm run start`

3) Environment variables
Set the following environment variables in the Render dashboard:
- `MONGODB_URI` — MongoDB connection string (use MongoDB Atlas or another host)
- `JWT_SECRET` — strong secret for signing tokens
- `PORT` — optional (Render will set a value by default)
- `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` — optional, for seeding a demo account

4) Seed demo user
After deployment you can seed the demo user by either:
- SSH into the instance and run `node seedDemoUser.js` (advanced), or
- Run the script locally against the production DB if you have a secure admin connection:

```bash
# from your local machine
MONGODB_URI="your-production-mongo-uri" DEMO_USER_EMAIL=demo@linkloop.test DEMO_USER_PASSWORD=DemoPass123! node LinkLoopLiteServer/seedDemoUser.js
```

5) Set privacy/support URLs in App Store Connect
- Once the service is live, your static pages will be available at:
  - `https://<your-service>.onrender.com/privacy`
  - `https://<your-service>.onrender.com/support`
  - `https://<your-service>.onrender.com/terms`

Alternative platforms: Heroku, Railway, Fly.io, or Render's competitors — the steps are similar (create a service, set env vars, deploy).
