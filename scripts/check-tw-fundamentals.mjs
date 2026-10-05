// Fails (exit 1) when a company's latest quarter has no predecessor although
// it has older data — i.e. a daily run missed a filing. GitHub then e-mails
// the failure; fix it by running the workflow with backfill=true.
import { findRecentGaps } from '../src/utils/twFundamentalsMerge.js'
import { EPS_PATH, readJson } from './lib/twse.mjs'

const history = await readJson(EPS_PATH, null)
if (!history) {
  console.error(`${EPS_PATH} not found`)
  process.exit(1)
}
const gaps = findRecentGaps(history)
if (gaps.length > 0) {
  console.error(`Quarter gaps in ${gaps.length} companies:`)
  for (const { code, missing } of gaps) console.error(`  ${code} missing ${missing}`)
  process.exit(1)
}
console.log('No quarter gaps')
