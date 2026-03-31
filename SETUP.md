# AI Digest — Setup Guide

## A. Create the GitHub repo

1. Create a new GitHub repo (public or private)
2. Push all the code:
   ```bash
   git init
   git add -A
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/ai-digest.git
   git push -u origin main
   ```

## B. Get a Gemini API key

1. Go to https://aistudio.google.com/apikey
2. Create a key
3. In your GitHub repo, go to **Settings > Secrets and variables > Actions**
4. Add a new secret: `GEMINI_API_KEY` with your key

## C. Connect Netlify

1. Go to https://app.netlify.com
2. Click **"Add new site"** > **"Import an existing project"**
3. Connect your GitHub repo
4. Set:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Deploy. Note your URL (something.netlify.app)

## D. How the pipeline runs

The digest is generated **automatically every day at 01:00 UTC (6am Almaty time)** via a GitHub Actions cron schedule. Gemini uses Google Search grounding to find the latest AI news, scores it, and commits the result.

**No additional setup is needed for the daily pipeline.** Once the repo is on GitHub with the `GEMINI_API_KEY` secret, it runs on its own.

### Alternative input methods (optional)

- **Perplexity email via Google Apps Script** — If you also want to process Perplexity daily digest emails, set up the Apps Script trigger (see below). When email content is provided, Gemini uses that instead of searching.
- **Manual paste** — Go to **GitHub Actions > digest workflow > "Run workflow"**, paste news content, and run. If you leave the content field empty, Gemini will search for today's news automatically.

## E. Set up Google Apps Script (optional)

Only needed if you want to process Perplexity digest emails as an additional input source.

1. Go to https://script.google.com
2. Create a new project
3. Paste the contents of `scripts/google-apps-script.js`
4. Go to **Project Settings > Script Properties**, add:
   - `GITHUB_TOKEN` — A GitHub fine-grained personal access token with **Contents read/write** permission on the repo
   - `GITHUB_REPO` — `your-username/ai-digest`
   - `SENDER_FILTER` — `perplexity` (adjust if your Perplexity emails come from a different address)
5. Set up a time-based trigger:
   - Go to **Triggers > Add Trigger**
   - Function: `checkForDigest`
   - Event source: **Time-driven**
   - Type: **Hour timer**
   - Interval: **Every 1 hour**
6. Run `checkForDigest` once manually to grant Gmail permissions

## F. Test the pipeline

- **Option 1:** Wait for the daily cron at 01:00 UTC. Check GitHub Actions for the run.
- **Option 2:** Go to **GitHub Actions > digest workflow > "Run workflow"** and run with empty content to trigger a Gemini search, or paste specific news content.
- **Option 3:** If Apps Script is set up, wait for a Perplexity email to arrive.

## G. Manual backup

If anything fails, go to **GitHub Actions > "Run workflow"** and either leave content empty (Gemini searches) or paste news manually.
