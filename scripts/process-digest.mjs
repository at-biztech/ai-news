import { writeFileSync } from 'fs'
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
- sourceUrl: The URL from the source content if available, otherwise empty string.
- sourceName: The domain name of the source.

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
  return `You will receive raw AI industry news content. Score and format ALL items.\n\n` + SCORING_INSTRUCTIONS + '\n\nHere is today\'s raw news content:\n\n' + content
}

const MODEL = 'gemini-2.5-flash'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`

async function callGemini(attempt = 1) {
  console.log(`Calling Gemini (attempt ${attempt})...`)

  const body = {
    contents: [{ parts: [{ text: searchMode ? buildSearchPrompt() : buildContentPrompt(rawContent) }] }],
    generationConfig: { temperature: 0.2 }
  }

  if (searchMode) {
    body.tools = [{ google_search: {} }]
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts
  if (!parts?.length) throw new Error('Empty response from Gemini')

  // In search mode, Gemini may return multiple parts — find the text part with JSON
  const textParts = parts.filter(p => p.text).map(p => p.text)
  const text = textParts.join('\n')
  if (!text) throw new Error('No text content in Gemini response')
  return text
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

function validate(digest) {
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
    if (!item.sourceUrl) item.sourceUrl = ''
    if (!item.sourceName) item.sourceName = ''
  }

  digest.items.sort((a, b) => b.score - a.score)

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
  let text
  try {
    text = await callGemini()
  } catch (e) {
    console.log(`First attempt failed: ${e.message}\nRetrying in 30 seconds...`)
    await new Promise(r => setTimeout(r, 30000))
    text = await callGemini(2)
  }

  const parsed = parseResponse(text)
  const digest = validate(parsed)

  const outPath = join(__dirname, 'output.json')
  writeFileSync(outPath, JSON.stringify(digest, null, 2))
  console.log(`Output written to ${outPath}`)
  console.log(`Date: ${digest.dateKey}, Items: ${digest.items.length} (${digest.critical} critical, ${digest.watch} watch, ${digest.low} low)`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
