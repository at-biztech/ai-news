import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputPath = join(__dirname, 'output.json')
const digestsPath = join(__dirname, '..', 'public', 'digests.json')

if (!existsSync(outputPath)) {
  console.error('scripts/output.json not found. Run process-digest.mjs first.')
  process.exit(1)
}

let newDigest
try {
  newDigest = JSON.parse(readFileSync(outputPath, 'utf-8'))
} catch (e) {
  console.error('Invalid JSON in output.json:', e.message)
  process.exit(1)
}

let data = { dates: [], digests: {} }
if (existsSync(digestsPath)) {
  try {
    data = JSON.parse(readFileSync(digestsPath, 'utf-8'))
    if (!data.dates) data.dates = []
    if (!data.digests) data.digests = {}
  } catch {
    data = { dates: [], digests: {} }
  }
}

const dateKey = newDigest.dateKey
data.digests[dateKey] = newDigest

if (!data.dates.includes(dateKey)) {
  data.dates.push(dateKey)
}
data.dates.sort((a, b) => b.localeCompare(a))

writeFileSync(digestsPath, JSON.stringify(data, null, 2))
console.log(`Updated digests.json: ${data.dates.length} total dates`)
console.log(`Added/updated: ${dateKey}`)

unlinkSync(outputPath)
console.log('Cleaned up output.json')
