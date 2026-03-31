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

## D. Set up Google Apps Script

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

## E. Test the pipeline

- **Option 1:** Wait for a Perplexity email to arrive. The pipeline triggers within the hour.
- **Option 2:** Go to **GitHub Actions > digest workflow > "Run workflow"**, paste some test news content, and run. Check that `digests.json` gets updated and Netlify redeploys.

## F. Manual backup

If Apps Script ever fails, go to **GitHub Actions > "Run workflow"** and paste news content manually. Same result.
