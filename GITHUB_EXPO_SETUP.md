# LinkLoop Lite — GitHub + Expo EAS Setup Guide

This guide walks you through connecting your repo to GitHub and Expo EAS so that pushes to `main` automatically deploy the server and publish app updates.

---

## Prerequisites

1. **Node.js** installed (LTS recommended):
```bash
brew install node
```

2. **Git** configured and a **GitHub account**.

3. **Expo account** — sign up free at https://expo.dev

4. **EAS CLI** installed:
```bash
npm install -g eas-cli
```

---

## Step 1 — Push to GitHub

If you haven't already created the GitHub repo:

```bash
cd "/Users/kevin/Desktop/KC Stuff/App Ideas/LinkLoopLite"
git init
git add .
git commit -m "Initial commit — LinkLoop Lite"
git branch -M main
git remote add origin https://github.com/kcunningham408/linkloop-lite.git
git push -u origin main
```

If the repo already exists, just commit and push:
```bash
cd "/Users/kevin/Desktop/KC Stuff/App Ideas/LinkLoopLite"
git add .
git commit -m "Add CI workflows, EAS scripts, docs"
git push
```

---

## Step 2 — Add GitHub Secrets

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name             | Value                                                                 |
|-------------------------|-----------------------------------------------------------------------|
| `EXPO_TOKEN`            | Your Expo access token (see Step 3 below)                            |
| `RENDER_DEPLOY_HOOK_URL`| Render deploy hook URL (see Step 5 below) — optional if using Render |

---

## Step 3 — Create an Expo Access Token

1. Go to https://expo.dev/accounts/kcunningham408/settings/access-tokens
2. Click **Create Token**
3. Name it (e.g., `github-actions`)
4. Copy the token
5. Paste it as the `EXPO_TOKEN` secret in GitHub (Step 2)

---

## Step 4 — Link project to EAS

```bash
cd "/Users/kevin/Desktop/KC Stuff/App Ideas/LinkLoopLite/LinkLoopLiteApp"
eas login                 # log in with your Expo account
eas init                  # links project (your app.json already has projectId)
```

Verify the EAS project ID matches `app.json → extra.eas.projectId`.

---

## Step 5 — Deploy Server to Render (for public API + privacy/support pages)

1. Go to https://render.com and sign up / log in.
2. **New → Web Service** → connect your GitHub repo.
3. Set:
   - **Root directory**: `LinkLoopLiteServer`
   - **Build command**: `npm install`
   - **Start command**: `node server.js`
4. Add environment variables in Render dashboard:
   - `MONGODB_URI` — your MongoDB Atlas connection string
   - `JWT_SECRET` — a strong random secret
5. (Optional) Copy the **Deploy Hook URL** from Render → your service → Settings → Deploy Hook.
   Paste it as `RENDER_DEPLOY_HOOK_URL` in GitHub secrets (Step 2).

Once deployed, your public URLs will be:
- API: `https://linkloop-lite-server.onrender.com/api`
- Privacy: `https://linkloop-lite-server.onrender.com/privacy`
- Support: `https://linkloop-lite-server.onrender.com/support`
- Terms: `https://linkloop-lite-server.onrender.com/terms`

---

## Step 6 — Set up MongoDB Atlas (if you don't have a database yet)

1. Go to https://www.mongodb.com/atlas and create a free account.
2. Create a **free shared cluster** (M0).
3. Create a **database user** (username + password).
4. **Network Access** → Add IP → Allow from Anywhere (`0.0.0.0/0`) for Render.
5. **Connect → Drivers** → copy the connection string. It looks like:
```
mongodb+srv://yourUser:yourPassword@cluster0.abc123.mongodb.net/linkloop-lite?retryWrites=true&w=majority
```
6. Paste that as `MONGODB_URI` in:
   - Render dashboard (environment variables)
   - Your local `.env` file

---

## Step 7 — Seed Demo User (for App Review)

After the server is running (locally or on Render):

```bash
cd "/Users/kevin/Desktop/KC Stuff/App Ideas/LinkLoopLite/LinkLoopLiteServer"
npm run seed:demo
```

Or against a remote DB:
```bash
MONGODB_URI="mongodb+srv://..." node seedDemoUser.js
```

Default demo credentials:
- Email: `demo@linkloop.test`
- Password: `DemoPass123!`

---

## Step 8 — Test the full flow

```bash
# 1. Start server locally (or use Render)
cd "/Users/kevin/Desktop/KC Stuff/App Ideas/LinkLoopLite/LinkLoopLiteServer"
npm install
npm run dev

# 2. Start app
cd "../LinkLoopLiteApp"
npm install
expo start          # scan QR with Expo Go
```

Or publish an OTA update to Expo (cloud):
```bash
cd "/Users/kevin/Desktop/KC Stuff/App Ideas/LinkLoopLite/LinkLoopLiteApp"
eas update --branch production --message "first publish"
```

---

## Step 9 — Build for iOS (when you have Apple Developer account)

1. Fill in `eas.json` → `submit.production.ios`:
   - `appleTeamId`: your Apple Developer Team ID
   - `ascAppId`: your App Store Connect App ID

2. Run:
```bash
npm run build:ios       # eas build -p ios --profile production
npm run submit:ios      # eas submit -p ios --profile production
```

---

## What happens on `git push` to main

| Change in…            | GitHub Action triggered  | What it does                                     |
|------------------------|--------------------------|--------------------------------------------------|
| `LinkLoopLiteServer/`  | `server-deploy.yml`      | Hits Render deploy hook → redeploys server       |
| `LinkLoopLiteApp/`     | `eas-build.yml`          | Runs `eas update` → OTA JS update via Expo       |
| Both                   | Both workflows fire      | Server redeploys + app OTA update pushed         |

---

## Files added / modified in this setup

| File                                         | Purpose                                      |
|----------------------------------------------|----------------------------------------------|
| `.github/workflows/server-deploy.yml`        | Auto-deploy server on push                   |
| `.github/workflows/eas-build.yml`            | Auto-publish app OTA update on push          |
| `.gitignore` (root)                          | Ignore .env, .DS_Store, editor files         |
| `LinkLoopLiteApp/.gitignore`                 | Ignore node_modules, .expo, .env, etc.       |
| `LinkLoopLiteApp/package.json`               | Added EAS npm scripts                        |
| `LinkLoopLiteApp/config/api.js`              | Reads EXPO_PUBLIC_API_URL env var             |
| `LinkLoopLiteApp/eas.json`                   | Added env block for production API URL       |
| `LinkLoopLiteServer/.env.example`            | Cleaned up example env                       |
| `LinkLoopLiteServer/seedDemoUser.js`         | Seed demo user for App Review                |
| `LinkLoopLiteServer/README.md`               | Server docs                                  |
| `LinkLoopLiteServer/DEPLOY_RENDER.md`        | Render deployment guide                      |
| `LinkLoopLiteApp/APP_STORE_SUBMISSION.md`    | App Store submission notes                   |
| `LinkLoopLiteApp/ScreenshotChecklist.md`     | Screenshot guidance                          |
| `README.md` (root)                           | Project overview and quick start             |
