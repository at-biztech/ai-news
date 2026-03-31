import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_API_KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1) }

let rawContent = process.env.RAW_CONTENT || ''
if (!rawContent.trim()) { console.error('Missing RAW_CONTENT'); process.exit(1) }

if (rawContent.length > 30000) {
  console.log(`Content truncated from ${rawContent.length} to 30000 chars`)
  rawContent = rawContent.slice(0, 30000) + '\n\n[Content truncated]'
}

const SYSTEM_PROMPT = `You are an AI news analyst for a team of digital ecosystem architects and automation builders.

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
}`

const MODEL = 'gemini-2.5-flash'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`

async function callGemini(content, attempt = 1) {
  console.log(`Calling Gemini (attempt ${attempt})...`)
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\nHere is today\'s raw news content:\n\n' + content }] }],
      generationConfig: { temperature: 0.2 }
    })
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty response from Gemini')
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
    if (!item.tag) item.tag = item.score >= 8 ? 'CRITICAL' : 'WATCH'
    if (!item.headline) item.headline = 'Untitled'
    if (!item.description) item.description = ''
    if (!item.useCase) item.useCase = ''
    if (!item.sourceUrl) item.sourceUrl = ''
    if (!item.sourceName) item.sourceName = ''
  }

  digest.relevant = digest.items.length
  digest.critical = digest.items.filter(i => i.score >= 8).length
  digest.watch = digest.items.filter(i => i.score >= 6 && i.score <= 7).length

  const [y, m, d] = digest.dateKey.split('-')
  const dt = new Date(y, m - 1, d)
  digest.date = dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return digest
}

async function main() {
  let text
  try {
    text = await callGemini(rawContent)
  } catch (e) {
    console.log('First attempt failed, retrying...')
    text = await callGemini(rawContent, 2)
  }

  const parsed = parseResponse(text)
  const digest = validate(parsed)

  const outPath = join(__dirname, 'output.json')
  writeFileSync(outPath, JSON.stringify(digest, null, 2))
  console.log(`Output written to ${outPath}`)
  console.log(`Date: ${digest.dateKey}, Items: ${digest.items.length} (${digest.critical} critical, ${digest.watch} watch)`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
