// Runs before `vite` / `vite build`: splits the market-wide snapshots in
// data/twse/ into public/data/tw/{code}.json (gitignored).
import { rm } from 'node:fs/promises'
import { buildCompanyFiles } from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, PE_PATH, REVENUE_PATH, readJson, writeJson } from './lib/twse.mjs'

const OUT_DIR = 'public/data/tw'

const [eps, pe, revenue] = await Promise.all([
  readJson(EPS_PATH, null),
  readJson(PE_PATH, null),
  readJson(REVENUE_PATH, null),
])
if (!eps) throw new Error(`${EPS_PATH} not found`)

const files = buildCompanyFiles({ eps, pe, revenue })
await rm(OUT_DIR, { recursive: true, force: true })
await Promise.all(Object.entries(files).map(([code, file]) => writeJson(`${OUT_DIR}/${code}.json`, file)))
console.log(`Split TW fundamentals: ${Object.keys(files).length} companies → ${OUT_DIR}`)
