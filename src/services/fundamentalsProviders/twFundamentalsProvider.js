// Reads the same-origin snapshots built by .github/workflows/update-tw-fundamentals.yml.
const EPS_URL = `${import.meta.env.BASE_URL}data/tw_eps_history.json`
const PE_URL = `${import.meta.env.BASE_URL}data/tw_pe_history.json`
const PE_POINTS = 60

let filesPromise = null

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`無法載入台股財報資料（HTTP ${response.status}）`)
  return response.json()
}

const loadFiles = () => {
  if (!filesPromise) {
    filesPromise = Promise.all([fetchJson(EPS_URL), fetchJson(PE_URL)]).catch((error) => {
      filesPromise = null
      throw error
    })
  }
  return filesPromise
}

export const resetTwFundamentalsCache = () => {
  filesPromise = null
}

// null = the code is not in the snapshot (上櫃, newly listed, ETF …).
export const getTwFundamentals = async (symbol) => {
  const [eps, pe] = await loadFiles()
  const company = eps?.companies?.[symbol]
  if (!company) return null
  const peSeries = (pe?.companies?.[symbol] ?? [])
    .slice(0, PE_POINTS)
    .map(([label, value]) => ({ label, pe: value }))
    .reverse()
  return {
    name: company.name,
    cumulative: company.quarters ?? {},
    peSeries,
    epsUpdatedAt: eps.updatedAt ?? null,
    peUpdatedAt: pe.updatedAt ?? null,
  }
}
