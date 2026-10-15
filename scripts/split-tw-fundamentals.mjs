// Runs before `vite` / `vite build`: splits the market-wide snapshots in
// data/twse/ into public/data/tw/{code}.json (gitignored), plus the
// screener's screen.json.
import { rm } from 'node:fs/promises'
import { buildScreenFile } from '../src/utils/stockScreen.js'
import { buildCompanyFiles } from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, PE_PATH, PROFILE_PATH, REVENUE_PATH, readJson, writeJson } from './lib/twse.mjs'

const OUT_DIR = 'public/data/tw'

const [eps, pe, revenue, profiles] = await Promise.all([
  readJson(EPS_PATH, null),
  readJson(PE_PATH, null),
  readJson(REVENUE_PATH, null),
  readJson(PROFILE_PATH, null),
])
if (!eps) throw new Error(`${EPS_PATH} not found`)

const files = buildCompanyFiles({ eps, pe, revenue })
await rm(OUT_DIR, { recursive: true, force: true })
await Promise.all(Object.entries(files).map(([code, file]) => writeJson(`${OUT_DIR}/${code}.json`, file)))
console.log(`Split TW fundamentals: ${Object.keys(files).length} companies → ${OUT_DIR}`)

// Projections are dated by the build (Taipei time); deploys run every weekday.
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
const screen = buildScreenFile({ files, profiles, todayIso, generatedAt: new Date().toISOString() })
await writeJson(`${OUT_DIR}/screen.json`, screen)
console.log(`Screen: ${screen.rows.length} rows${profiles ? '' : ' (no company profile)'}`)
