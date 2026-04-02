import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1) }

let rawContent = (process.env.RAW_CONTENT || '').trim()
const searchMode = !rawContent

if (rawContent.length > 30000) {
  console.log(`Content truncated from ${rawContent.length} to 30000 chars`)
  rawContent = rawContent.slice(0, 30000) + '\n\n[Content truncated]'
}

console.log(searchMode ? 'Search mode: Gemini will find today\'s AI news via Google Search' : 'Content mode: processing provided content')

const SCORING_INSTRUCTIONS = `You are an AI news analyst for a team of digital ecosystem architects and automation builders.

Your job:

1. Score each news item 1 to 10 based on relevance to someone who builds AI-powered automated systems, integrates AI tools into business operations, and designs digital ecosystems across industries.

Scoring priority (in this order):
- Will this change how AI ecosystems are built in the next 6 months?
- Major industry shift?
- Usable right now in real work?
- New capability that did not exist yesterday?

2. Assign a tag based on score:
- CRITICAL (8 to 10): Stop what you are doing and read this.
- WATCH (6 to 7): Worth knowing, keep an eye on it.
- LOW (1 to 5): Noted. Not directly relevant right now.
- Include ALL items. Do not skip or exclude any news. Every item must appear in the output.

3. For each item, provide:
- headline: A simple one-line headline (rewrite if the original is unclear)
- description: 1 to 2 sentences explaining what happened in the simplest possible words. No jargon. If you must use a technical term, explain it in parentheses. Write like you are explaining to a smart person who is not a native English speaker.
- useCase: One specific, concrete scenario of how this could be applied in building AI automations, connecting systems, or designing digital workflows. For lower-scored items, explain why it is less relevant or what would need to change for it to matter. Never generic.
- category: One of: Models, Tools, Regulation, Funding, Hardware, Healthcare, Infrastructure, Research, or whatever fits best.
- sourceUrl: The actual, direct URL of the original article or announcement. NEVER use vertexaisearch.cloud.google.com or grounding-api-redirect URLs. Use the real website URL (e.g. https://techcrunch.com/2026/..., https://reuters.com/...). If you cannot determine the real URL, use an empty string.
- sourceName: The domain name of the source (e.g. techcrunch.com, reuters.com).

4. Also provide:
- totalScanned: Total number of distinct news items in the input
- summary: One line. Start with "Big day." or "Quiet day." followed by the main takeaway.
- footerNote: Any gaps or patterns noted in today's news cycle.

5. If there are no items at all, return valid JSON with an empty items array.

IMPORTANT:
- Do not invent news. Only work with what is provided or found via search.
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
  "low": 0,
  "summary": "",
  "footerNote": "",
  "items": [
    {
      "score": 0,
      "tag": "CRITICAL, WATCH, or LOW",
      "category": "",
      "headline": "",
      "description": "",
      "useCase": "",
      "sourceUrl": "",
      "sourceName": ""
    }
  ]
}`

function buildSearchPrompt() {
  return `Search the web for all significant AI industry news from the last 24 hours. Look broadly across: new model releases, AI tool launches, funding rounds, regulation updates, hardware announcements, research breakthroughs, partnerships, and any other notable AI developments.

Find as many distinct news items as possible. Do not limit yourself to a small number.

Then score and format ALL of them.\n\n` + SCORING_INSTRUCTIONS
}

function buildContentPrompt(content) {
  return `The following is a summary of today's AI news from a research assistant. This is your primary source of truth.

Your tasks:
1. Process EVERY item from this summary. Do not skip any. For each item, search the web to find the real source URL and additional details.
2. After processing all items from the summary, search the web for any other major AI news from the last 24 hours that is NOT already covered. Only add additional items if they would score 7 or higher. Do not pad the list with low-relevance additions.
3. Score and format ALL items (from the summary + any high-scoring additions).

Then format the output.\n\n` + SCORING_INSTRUCTIONS + '\n\nHere is the summary:\n\n' + content
}

const PRIMARY_MODEL = 'gemini-2.5-pro'
const FALLBACK_MODEL = 'gemini-2.5-flash'

function apiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`
}

async function callGeminiWithModel(model) {
  console.log(`Calling ${model}...`)

  const body = {
    contents: [{ parts: [{ text: searchMode ? buildSearchPrompt() : buildContentPrompt(rawContent) }] }],
    generationConfig: { temperature: 0.2 },
    tools: [{ google_search: {} }]
  }

  const res = await fetch(apiUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${model} API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts
  if (!parts?.length) throw new Error('Empty response from ' + model)

  const textParts = parts.filter(p => p.text).map(p => p.text)
  const text = textParts.join('\n')
  if (!text) throw new Error('No text content from ' + model)
  return text
}

async function callGemini() {
  try {
    return await callGeminiWithModel(PRIMARY_MODEL)
  } catch (e) {
    console.log(`${PRIMARY_MODEL} failed: ${e.message}`)
    console.log(`Falling back to ${FALLBACK_MODEL} in 30 seconds...`)
    await new Promise(r => setTimeout(r, 30000))
    return await callGeminiWithModel(FALLBACK_MODEL)
  }
}

function parseResponse(text) {
  try { return JSON.parse(text) } catch {}
  try {
    const stripped = text.replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    return JSON.parse(stripped)
  } catch {}
  try {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first !== -1 && last !== -1) return JSON.parse(text.slice(first, last + 1))
  } catch {}
  throw new Error('Failed to parse Gemini response:\n' + text.slice(0, 500))
}

function getPreviousHeadlines() {
  const digestsPath = join(__dirname, '..', 'public', 'digests.json')
  if (!existsSync(digestsPath)) return []
  try {
    const data = JSON.parse(readFileSync(digestsPath, 'utf-8'))
    const dates = data.dates || []
    // Get headlines from the most recent 2 days
    const recentHeadlines = []
    for (const d of dates.slice(0, 2)) {
      const digest = data.digests[d]
      if (digest?.items) {
        for (const item of digest.items) {
          recentHeadlines.push(item.headline.toLowerCase().replace(/[^a-z0-9\s]/g, ''))
        }
      }
    }
    return recentHeadlines
  } catch { return [] }
}

function isDuplicate(headline, previousHeadlines) {
  const normalized = headline.toLowerCase().replace(/[^a-z0-9\s]/g, '')
  const words = normalized.split(/\s+/).filter(w => w.length > 3)
  for (const prev of previousHeadlines) {
    // Check if 60%+ of significant words match
    const matchCount = words.filter(w => prev.includes(w)).length
    if (words.length > 0 && matchCount / words.length >= 0.6) return true
  }
  return false
}

async function validate(digest) {
  if (!digest.dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(digest.dateKey)) {
    const now = new Date()
    digest.dateKey = now.toISOString().split('T')[0]
  }

  if (!Array.isArray(digest.items)) digest.items = []

  for (const item of digest.items) {
    if (typeof item.score !== 'number' || item.score < 1 || item.score > 10) item.score = 6
    item.tag = item.score >= 8 ? 'CRITICAL' : item.score >= 6 ? 'WATCH' : 'LOW'
    if (!item.headline) item.headline = 'Untitled'
    if (!item.description) item.description = ''
    if (!item.useCase) item.useCase = ''
    if (!item.sourceUrl || item.sourceUrl.includes('grounding-api-redirect') || item.sourceUrl.includes('vertexaisearch.cloud.google.com')) item.sourceUrl = ''
    if (!item.sourceName) item.sourceName = ''
  }

  digest.items.sort((a, b) => b.score - a.score)

  // Deduplicate against recent days
  const previousHeadlines = getPreviousHeadlines()
  if (previousHeadlines.length > 0) {
    const before = digest.items.length
    digest.items = digest.items.filter(item => !isDuplicate(item.headline, previousHeadlines))
    const removed = before - digest.items.length
    if (removed > 0) console.log(`Dedup: removed ${removed} items already covered in recent digests`)
  }

  // Verify URLs actually exist
  console.log('Verifying source URLs...')
  let broken = 0
  await Promise.all(digest.items.map(async (item) => {
    if (!item.sourceUrl) return
    try {
      const res = await fetch(item.sourceUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) {
        // Try GET as some servers block HEAD
        const res2 = await fetch(item.sourceUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000)
        })
        if (!res2.ok) {
          item.sourceUrl = ''
          broken++
        }
      }
    } catch {
      item.sourceUrl = ''
      broken++
    }
  }))
  if (broken > 0) console.log(`Cleared ${broken} broken URLs`)

  digest.totalScanned = digest.items.length
  digest.relevant = digest.items.filter(i => i.score >= 6).length
  digest.critical = digest.items.filter(i => i.score >= 8).length
  digest.watch = digest.items.filter(i => i.score >= 6 && i.score <= 7).length
  digest.low = digest.items.filter(i => i.score < 6).length

  const [y, m, d] = digest.dateKey.split('-')
  const dt = new Date(y, m - 1, d)
  digest.date = dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return digest
}

async function main() {
  const text = await callGemini()

  const parsed = parseResponse(text)
  const digest = await validate(parsed)

  const outPath = join(__dirname, 'output.json')
  writeFileSync(outPath, JSON.stringify(digest, null, 2))
  console.log(`Output written to ${outPath}`)
  console.log(`Date: ${digest.dateKey}, Items: ${digest.items.length} (${digest.critical} critical, ${digest.watch} watch, ${digest.low} low)`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
