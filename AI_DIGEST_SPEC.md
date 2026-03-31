# AI News Digest — Full Project Spec

> Feed this entire document to Claude Code. It contains everything needed to build, test, and deploy.

---

## What this is

A fully automated daily AI news digest website. Zero human intervention after setup.

**Daily pipeline:**
1. Google Apps Script checks Gmail for new Perplexity daily digest email
2. Extracts the text, triggers a GitHub Actions workflow
3. GitHub Action sends the content to Gemini 2.5 Pro for scoring and formatting
4. Gemini output is validated, committed as JSON to the repo
5. Netlify auto-deploys the updated site

**The website:**
- React (Vite) static site hosted on Netlify
- Loads all digests from a single `digests.json` file
- Shows one day at a time with prev/next navigation + sidebar to pick any date
- Light/dark mode toggle
- Cards for each news item with score, tag, category, summary, use case, source link
- Charts (donut by category, bar by score) when 5+ items on a given day
- Clean, minimal, mobile-friendly design

---

## File structure

```
ai-digest/
├── .github/
│   └── workflows/
│       └── digest.yml              # GitHub Actions workflow
├── scripts/
│   ├── process-digest.mjs          # Node script: calls Gemini, outputs JSON
│   ├── update-digests.mjs          # Node script: merges new day into digests.json
│   └── google-apps-script.js       # Copy-paste into Google Apps Script
├── public/
│   └── digests.json                # All digests (committed by GitHub Actions)
├── src/
│   ├── App.jsx                     # Main app component
│   ├── App.css                     # Styles
│   └── main.jsx                    # Entry point
├── index.html
├── package.json
├── vite.config.js
├── SETUP.md                        # One-time setup instructions
└── README.md
```

---

## 1. Google Apps Script (`scripts/google-apps-script.js`)

This runs inside Google Apps Script (script.google.com), NOT in the repo. The file in the repo is just a reference copy for the user to paste.

### What it does:
- Runs on a time-based trigger (every 1 hour)
- Searches Gmail for emails from Perplexity that arrived today and don't have the label "Digest-Processed"
- Takes the MOST RECENT matching email
- Extracts the plain text body (or strips HTML if plain text is unavailable)
- Sends the content to GitHub Actions via `repository_dispatch` event
- Labels the email "Digest-Processed" so it's never processed twice

### Key details:
- The user will store their GitHub Personal Access Token (fine-grained, repo scope) as a Script Property called `GITHUB_TOKEN`
- The user will store their GitHub repo as a Script Property called `GITHUB_REPO` (format: `username/repo-name`)
- The dispatch event type is `new-digest`
- The email content goes in `client_payload.email_content`
- The email subject goes in `client_payload.email_subject`
- The email date goes in `client_payload.email_date`

### Edge cases to handle:
- No matching email found today → do nothing, exit silently
- Email already has "Digest-Processed" label → skip it
- GitHub API call fails → log error in Apps Script logger, don't label the email (so it retries next hour)
- Email body is HTML → strip tags to get plain text (basic regex is fine, doesn't need to be perfect)
- Multiple Perplexity emails in one day → only process the latest one

### Gmail search query:
```
from:perplexity newer_than:1d -label:Digest-Processed
```

NOTE: The user might need to adjust the "from" address. Add a Script Property called `SENDER_FILTER` with default value `perplexity` that the user can change. Use it in the search query.

### Code structure:
```javascript
function checkForDigest() {
  // 1. Get config from Script Properties
  // 2. Search Gmail
  // 3. If no results, return
  // 4. Get latest thread, get latest message
  // 5. Extract text content
  // 6. Call GitHub API: POST /repos/{owner}/{repo}/dispatches
  // 7. If success, label the email
  // 8. If fail, log and skip labeling
}

function createLabelIfNeeded() {
  // Creates "Digest-Processed" label if it doesn't exist
}

// Helper: strip HTML tags
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
```

---

## 2. GitHub Actions Workflow (`.github/workflows/digest.yml`)

### Triggers:
- `repository_dispatch` with type `new-digest` (from Apps Script)
- `workflow_dispatch` with an input `manual_content` (textarea) so the user can manually paste news and trigger it from the GitHub UI — useful as a backup

### Environment:
- Node 20
- Secrets needed: `GEMINI_API_KEY`

### Steps:
1. Checkout repo
2. Setup Node 20
3. Install dependencies (`npm ci`)
4. Extract content:
   - If `repository_dispatch`: get from `github.event.client_payload.email_content`
   - If `workflow_dispatch`: get from `github.event.inputs.manual_content`
5. Run `node scripts/process-digest.mjs` with content passed via environment variable `RAW_CONTENT`
6. Run `node scripts/update-digests.mjs` which merges the new day into `public/digests.json`
7. Configure git (user: "AI Digest Bot", email: "bot@digest.local")
8. Commit and push `public/digests.json`
   - Commit message: `digest: YYYY-MM-DD`
   - If nothing changed (duplicate run), skip commit gracefully

### Edge cases:
- Empty content → fail the job with clear error message
- Gemini API fails → fail the job (GitHub will show it as failed, user can re-run)
- digests.json doesn't exist yet → create it fresh
- Race condition (two runs at once) → unlikely since it's daily, but use `git pull --rebase` before push
- Content too long for Gemini → truncate to 30,000 characters with a note

---

## 3. Gemini Processing Script (`scripts/process-digest.mjs`)

### What it does:
- Reads `RAW_CONTENT` from environment variable
- Sends it to Gemini 2.5 Pro with the scoring prompt
- Parses the JSON response
- Validates the output structure
- Writes result to `scripts/output.json` (temp file for the next step)

### Gemini API call:
- Model: `gemini-2.5-pro-preview-05-06` (check latest available model string, use whatever is current and free-tier eligible — the most capable free model)
- API endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- API key passed via query param: `?key=${GEMINI_API_KEY}`
- Temperature: 0.2 (we want consistent, not creative)
- Response must be valid JSON

### System prompt (include this EXACTLY in the script):

```
You are an AI news analyst for a team of digital ecosystem architects and automation builders.

You will receive raw AI industry news content. Your job:

1. Score each news item 1 to 10 based on relevance to someone who builds AI-powered automated systems, integrates AI tools into business operations, and designs digital ecosystems across industries.

Scoring priority (in this order):
- Will this change how AI ecosystems are built in the next 6 months?
- Major industry shift?
- Usable right now in real work?
- New capability that did not exist yesterday?

2. Assign a tag based on score:
- CRITICAL (8 to 10): Stop what you are doing and read this.
- WATCH (6 to 7): Worth knowing, keep an eye on it.
- Skip anything below 6 entirely. Do not include it in the output.

3. For each qualifying item, provide:
- headline: A simple one-line headline (rewrite if the original is unclear)
- description: 1 to 2 sentences explaining what happened in the simplest possible words. No jargon. If you must use a technical term, explain it in parentheses. Write like you are explaining to a smart person who is not a native English speaker.
- useCase: One specific, concrete scenario of how this could be applied in building AI automations, connecting systems, or designing digital workflows. Never generic. Never "could be useful for automation." Always a real scenario.
- category: One of: Models, Tools, Regulation, Funding, Hardware, Healthcare, Infrastructure, Research, or whatever fits best.
- sourceUrl: The URL from the source content if available, otherwise empty string.
- sourceName: The domain name of the source.

4. Also provide:
- totalScanned: Total number of distinct news items in the input
- summary: One line. Start with "Big day." or "Quiet day." followed by the main takeaway.
- footerNote: What was excluded and why. Any gaps noted.

5. If no items score 6 or above, still return valid JSON with an empty items array.

IMPORTANT:
- Do not invent news. Only work with what is provided.
- Keep all text short. Every word must earn its place.
- No emojis.
- Items must be sorted by score, highest first.

Respond with ONLY valid JSON matching this exact structure, no markdown fences, no explanation:

{
  "date": "Month DD, YYYY",
  "dateKey": "YYYY-MM-DD",
  "totalScanned": 0,
  "relevant": 0,
  "critical": 0,
  "watch": 0,
  "summary": "",
  "footerNote": "",
  "items": [
    {
      "score": 0,
      "tag": "CRITICAL or WATCH",
      "category": "",
      "headline": "",
      "description": "",
      "useCase": "",
      "sourceUrl": "",
      "sourceName": ""
    }
  ]
}
```

### Response parsing:
1. Try `JSON.parse(response)` directly
2. If that fails, try stripping markdown code fences (```json ... ```) and parse again
3. If that fails, try extracting content between first `{` and last `}` and parse
4. If all fail, throw error with the raw response logged

### Validation after parsing:
- Must have `dateKey` matching `YYYY-MM-DD` format
- Must have `items` as an array
- Each item must have `score` (number 1-10), `tag`, `headline`, `description`, `useCase`
- `relevant` must equal `items.length`
- `critical` must equal count of items with score >= 8
- `watch` must equal count of items with score 6-7
- If counts don't match, fix them (don't fail, just correct)

### Date handling:
- Use today's date (UTC) for `dateKey` if Gemini's date looks wrong
- The `date` display string should match `dateKey`

---

## 4. Digest Merger Script (`scripts/update-digests.mjs`)

### What it does:
- Reads `scripts/output.json` (today's digest from Gemini)
- Reads `public/digests.json` (existing archive, or empty object `{}` if first run)
- Adds/replaces today's entry keyed by `dateKey`
- Sorts keys in reverse chronological order (newest first)
- Writes updated `public/digests.json`
- Deletes `scripts/output.json`

### digests.json structure:
```json
{
  "dates": ["2026-03-30", "2026-03-29"],
  "digests": {
    "2026-03-30": { ...full digest object... },
    "2026-03-29": { ...full digest object... }
  }
}
```

### Edge cases:
- File doesn't exist → create with empty `dates` array and `digests` object
- Same date already exists → overwrite (re-runs are fine)
- output.json is missing → throw clear error
- output.json has invalid JSON → throw clear error

---

## 5. Frontend (`src/App.jsx`, `src/App.css`, `src/main.jsx`)

### Architecture:
- Single page React app (Vite)
- On mount, fetches `/digests.json`
- Stores in state, defaults to showing the most recent date
- Navigation: prev/next arrows and sidebar

### App.jsx — State:
```
digests: object           // full digests.json content
dates: string[]           // sorted date keys (newest first)
currentDate: string       // currently viewed dateKey
sidebar: boolean          // sidebar open/closed
dark: boolean             // dark mode on/off
loading: boolean
error: string | null
```

### App.jsx — Behavior:
- Fetch `/digests.json` on mount
- If fetch fails, show error state with retry button
- Default to first date in `dates` array
- Prev arrow = go to older date (next index in array)
- Next arrow = go to newer date (previous index in array)
- Sidebar shows all dates, clicking one selects it and closes sidebar
- Dark mode toggles a class on the root element, persisted to localStorage
- Mobile-friendly: cards stack vertically, sidebar overlays

### Design — Color tokens:

Define these as CSS custom properties on `:root` and `[data-theme="dark"]`:

**Light mode (default):**
- --bg: #ffffff
- --bg-secondary: #f5f5f4
- --bg-tertiary: #eeedec
- --text: #1a1a1a
- --text-secondary: #6b6b6b
- --text-tertiary: #9a9a9a
- --border: rgba(0,0,0,0.1)
- --card-bg: #ffffff
- --amber-bg: #FAEEDA
- --amber-text: #854F0B
- --red-bg: #FCEBEB
- --red-text: #A32D2D
- --teal: #5DCAA5
- --link: #378ADD
- --overlay: rgba(0,0,0,0.3)
- --sidebar-bg: #ffffff
- --active-bg: #E6F1FB
- --active-text: #185FA5

**Dark mode:**
- --bg: #111111
- --bg-secondary: #1a1a1a
- --bg-tertiary: #222222
- --text: #e8e8e8
- --text-secondary: #a0a0a0
- --text-tertiary: #555555
- --border: rgba(255,255,255,0.08)
- --card-bg: #181818
- --amber-bg: #412402
- --amber-text: #FAC775
- --red-bg: #501313
- --red-text: #F7C1C1
- --teal: #1D9E75
- --link: #85B7EB
- --overlay: rgba(0,0,0,0.6)
- --sidebar-bg: #141414
- --active-bg: #042C53
- --active-text: #85B7EB

### Design — Layout:

**Header area:**
- Hamburger button (opens sidebar) on the left
- "AI ECOSYSTEM DIGEST" label (small, uppercase, muted) above the date
- Date with left/right chevron arrows
- Dark mode toggle button on the right
- Below: pill badges showing counts (X scanned, X relevant, X CRITICAL, X WATCH)
- Below: one-line summary text
- Thin divider line

**Cards:**
- Each card has: score number (large, left), tag badge (CRITICAL=red, WATCH=amber), category badge (neutral), headline (bold), description (muted), use case block (left teal border, secondary background), source link
- Cards sorted highest score to lowest (already sorted in JSON)
- If no items: centered "Nothing critical today" message

**Charts (only when 5+ items):**
- Donut chart: items by category. SVG-based, hand-drawn (no library needed for a simple donut). Show legend beside it.
- Bar chart: score distribution. Simple horizontal bars.
- Chart colors for categories (cycle through): Blue #378ADD, Teal #5DCAA5, Coral #D85A30, Purple #7F77DD, Pink #D4537E, Green #639922, Amber #BA7517, Gray #888780, Red #E24B4A
- In dark mode use lighter variants: #85B7EB, #5DCAA5, #F0997B, #AFA9EC, #ED93B1, #97C459, #FAC775, #B4B2A9, #F09595

**Sidebar:**
- Fixed overlay, slides in from left
- Semi-transparent backdrop that closes sidebar on click
- Lists all dates, newest first
- Current date is highlighted
- Latest date has a small "latest" label

**Footer:**
- footerNote text (muted, small)
- Total digest count

### Design — Rules:
- No emojis anywhere
- Font: system font stack (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)
- Border radius: 12px for cards, 8px for badges and buttons, 6px for pills
- Button style: transparent background, 0.5px border, icon inside
- No box shadows except in light mode cards (very subtle: 0 1px 3px rgba(0,0,0,0.04))
- Good spacing: 14px gap between cards, 1rem-1.5rem padding
- Max width: 760px, centered
- Mobile: works down to 360px wide

---

## 6. Vite Config (`vite.config.js`)

Simple:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
```

---

## 7. package.json

```json
{
  "name": "ai-digest",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "process": "node scripts/process-digest.mjs",
    "update": "node scripts/update-digests.mjs"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

---

## 8. index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Digest</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23378ADD'/><text y='72' x='50' text-anchor='middle' font-size='60' fill='white' font-family='sans-serif' font-weight='bold'>D</text></svg>" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## 9. SETUP.md — One-time setup instructions to include in the repo

Write clear step-by-step instructions covering:

### A. Create the GitHub repo
- Create a new repo (public or private, either works)
- Push all the code

### B. Get a Gemini API key
- Go to https://aistudio.google.com/apikey
- Create a key
- Add it as a GitHub repo secret: `GEMINI_API_KEY`

### C. Connect Netlify
- Go to https://app.netlify.com
- "Add new site" → "Import an existing project" → connect GitHub repo
- Build command: `npm run build`
- Publish directory: `dist`
- Deploy. Note the URL (something.netlify.app)

### D. Set up Google Apps Script
- Go to https://script.google.com
- New project
- Paste the contents of `scripts/google-apps-script.js`
- Go to Project Settings → Script Properties, add:
  - `GITHUB_TOKEN`: a GitHub fine-grained personal access token with Contents read/write permission on the repo
  - `GITHUB_REPO`: `your-username/ai-digest`
  - `SENDER_FILTER`: `perplexity` (adjust if your Perplexity emails come from a different address)
- Set up a time-based trigger:
  - Triggers → Add Trigger
  - Function: `checkForDigest`
  - Event source: Time-driven
  - Type: Hour timer
  - Interval: Every 1 hour
- Run `checkForDigest` once manually to grant Gmail permissions

### E. Test the pipeline
- Option 1: Wait for a Perplexity email to arrive. The pipeline should trigger within the hour.
- Option 2: Go to GitHub Actions → digest workflow → "Run workflow" → paste some test news content → Run. Check that digests.json gets updated and Netlify redeploys.

### F. Manual backup option
- If Apps Script ever fails, you can always go to GitHub Actions → "Run workflow" and paste news content manually. Same result.

---

## Edge cases checklist

These must all be handled:

| Scenario | Expected behavior |
|----------|-------------------|
| No Perplexity email today | Apps Script does nothing. No error. |
| Perplexity changes email format | Still works — we extract plain text, not structured HTML. |
| Perplexity email arrives twice | Only first one is processed (labeled after processing). |
| Gemini API is down | GitHub Action fails. Shows as failed run. User can retry. |
| Gemini returns malformed JSON | Script retries once. If still bad, fails with logged error. |
| Gemini returns valid JSON but bad data | Validation fixes counts, uses today's date if date is wrong. |
| All items score below 6 | Valid digest with empty items array and "Nothing critical today" summary. |
| digests.json doesn't exist yet | Created fresh on first run. |
| Same day processed twice | Overwrites that day's entry. No duplicates. |
| Pipeline runs but nothing changed | Git commit skipped gracefully (no empty commits). |
| Netlify build fails | Unlikely (simple static build). Netlify shows error in dashboard. |
| User wants to manually trigger | workflow_dispatch with textarea input. Same pipeline. |
| Very long email (>50k chars) | Truncated to 30,000 chars before sending to Gemini. |
| Email is in non-English language | Gemini handles it — summaries come out in English. |
| fetch of digests.json fails on site | Error state with retry button. |
| digests.json is empty | "No digests yet" message on site. |
| User visits site before first digest | Same as above. |
| Dark mode preference | Saved to localStorage, restored on load. |

---

## What NOT to build

- No database. JSON file in the repo is the database.
- No authentication on the website. It's a read-only digest.
- No admin panel. GitHub Actions + Apps Script IS the admin.
- No SSR. Pure client-side React is fine for this.
- No analytics. Keep it simple.
- No service worker or PWA features.
- No comments or social features.
- No email notifications.

---

## Test it locally

After building, the dev should be able to:

1. `npm run dev` → site loads, shows "No digests yet" (or sample data)
2. Create a sample `public/digests.json` with test data → site renders it
3. Set `GEMINI_API_KEY` env var → run `RAW_CONTENT="some test news" node scripts/process-digest.mjs` → check output.json
4. Run `node scripts/update-digests.mjs` → check digests.json updated

Include a `public/digests.json` with the March 29, 2026 data already in it so the site has something to show from day one:

```json
{
  "dates": ["2026-03-29"],
  "digests": {
    "2026-03-29": {
      "date": "March 29, 2026",
      "dateKey": "2026-03-29",
      "totalScanned": 7,
      "relevant": 4,
      "critical": 0,
      "watch": 4,
      "summary": "Quiet day. China-heavy news cycle with healthcare and infrastructure moves. No major model or tool releases from Western labs.",
      "footerNote": "3 items scored below 6 and were excluded (Tongtong 3.0 embodied AI, AGI4S research program, Zhongguancun Forum policy recap). No major Western lab announcements detected in this cycle.",
      "items": [
        { "score": 7, "tag": "WATCH", "category": "Healthcare", "headline": "China announces first \"Super AI Hospital\" with end-to-end AI care pathways", "description": "A group of Chinese companies launched a hospital model where AI handles the full patient journey: sorting patients by urgency, helping with diagnosis, suggesting treatment plans, and tracking recovery. Instead of using AI for one task, the whole system is connected.", "useCase": "Reference architecture for any client building a multi-agent system in healthcare or insurance. Map their patient/claim journey and place AI agents at each handoff point instead of bolting on a single chatbot.", "sourceUrl": "https://k.sina.com.cn/article_7857201856_1d45362c001903ri16.html?from=tech", "sourceName": "k.sina.com" },
        { "score": 7, "tag": "WATCH", "category": "Tools / Legal", "headline": "ExposeIQ launches real-time AI deposition analysis with human verification", "description": "A new legal tool uses AI to analyze live court depositions (sworn testimony sessions) as they happen, spotting contradictions and key statements instantly. A human checks every AI output before lawyers see it, reducing the risk of AI mistakes in high-stakes situations.", "useCase": "Blueprint for any real-time AI + human-in-the-loop workflow. Apply this pattern to compliance monitoring, live call analysis, or QA pipelines where AI flags issues and a human approves before action is taken.", "sourceUrl": "https://www.palmbeachpost.com/press-release/story/164986/exposeiq-launches-aihuman-verified-litigation-platform-offering-real-time-live-deposition-analysis/", "sourceName": "palmbeachpost.com" },
        { "score": 6, "tag": "WATCH", "category": "Infrastructure", "headline": "China launches open-source AI alliance and FlagOS 2.0 platform for domestic AI stack", "description": "Over 40 Chinese organizations formed a new alliance to build a China-controlled open-source AI ecosystem. They also released FlagOS 2.0, a platform that supports more types of AI chips and aims to make training and running large AI models faster and more stable.", "useCase": "If building AI systems for clients with operations in China, track FlagOS compatibility. It signals which chip/model combos will be supported domestically, affecting infrastructure choices for any China-facing deployment.", "sourceUrl": "https://k.sina.com.cn/article_7857201856_1d45362c001903rbos.html?from=tech", "sourceName": "k.sina.com" },
        { "score": 6, "tag": "WATCH", "category": "Government / Legal", "headline": "India launches Nyaya Setu AI chatbot for public legal access", "description": "India's Vice President launched an AI chatbot that answers basic legal questions and guides citizens through court procedures. It is designed to help people who cannot easily access lawyers, making legal information available at scale.", "useCase": "Template for government-facing AI chatbot projects. Note the pattern: narrow domain (legal procedures), high-trust requirement, always-on availability. Replicable for immigration, tax guidance, or municipal services bots.", "sourceUrl": "https://www.newindianexpress.com/nation/2026/Mar/29/vice-president-radhakrishnan-launches-ai-chatbot-nyaya-setu-to-expand-access-to-justice", "sourceName": "newindianexpress.com" }
      ]
    }
  }
}
```

---

## Summary for Claude Code

Build this in order:
1. `package.json`, `vite.config.js`, `index.html` — scaffold
2. `src/main.jsx`, `src/App.jsx`, `src/App.css` — frontend
3. `public/digests.json` — seed data
4. Test: `npm run dev`, verify site works
5. `scripts/process-digest.mjs` — Gemini integration
6. `scripts/update-digests.mjs` — JSON merger
7. Test: run scripts locally with a test input
8. `.github/workflows/digest.yml` — automation
9. `scripts/google-apps-script.js` — email trigger
10. `SETUP.md` — user instructions
11. Final test: full local pipeline end to end
