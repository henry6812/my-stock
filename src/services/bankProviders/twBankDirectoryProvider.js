const CACHE_KEY = 'tw-bank-directory-cache-v1'
const CACHE_EXPIRES_MS = 1000 * 60 * 60 * 24 * 7

const FISC_URL = 'https://data.gov.tw/api/v1/rest/datastore/6041?format=json'
const BRANCH_URL = 'https://data.gov.tw/api/v1/rest/datastore/7778?format=json'
const FALLBACK_BANKS = [
  { bankCode: '004', bankName: '臺灣銀行' },
  { bankCode: '005', bankName: '臺灣土地銀行' },
  { bankCode: '006', bankName: '合作金庫商業銀行' },
  { bankCode: '007', bankName: '第一商業銀行' },
  { bankCode: '008', bankName: '華南商業銀行' },
  { bankCode: '009', bankName: '彰化商業銀行' },
  { bankCode: '011', bankName: '上海商業儲蓄銀行' },
  { bankCode: '012', bankName: '台北富邦商業銀行' },
  { bankCode: '013', bankName: '國泰世華商業銀行' },
  { bankCode: '017', bankName: '兆豐國際商業銀行' },
  { bankCode: '021', bankName: '花旗(台灣)商業銀行' },
  { bankCode: '048', bankName: '王道商業銀行' },
  { bankCode: '050', bankName: '臺灣中小企業銀行' },
  { bankCode: '052', bankName: '渣打國際商業銀行' },
  { bankCode: '053', bankName: '台中商業銀行' },
  { bankCode: '054', bankName: '京城商業銀行' },
  { bankCode: '081', bankName: '滙豐(台灣)商業銀行' },
  { bankCode: '101', bankName: '瑞興商業銀行' },
  { bankCode: '102', bankName: '華泰商業銀行' },
  { bankCode: '103', bankName: '臺灣新光商業銀行' },
  { bankCode: '108', bankName: '陽信商業銀行' },
  { bankCode: '118', bankName: '板信商業銀行' },
  { bankCode: '147', bankName: '三信商業銀行' },
  { bankCode: '803', bankName: '聯邦商業銀行' },
  { bankCode: '805', bankName: '遠東國際商業銀行' },
  { bankCode: '806', bankName: '元大商業銀行' },
  { bankCode: '807', bankName: '永豐商業銀行' },
  { bankCode: '808', bankName: '玉山商業銀行' },
  { bankCode: '809', bankName: '凱基商業銀行' },
  { bankCode: '810', bankName: '星展(台灣)商業銀行' },
  { bankCode: '812', bankName: '台新國際商業銀行' },
  { bankCode: '816', bankName: '安泰商業銀行' },
  { bankCode: '822', bankName: '中國信託商業銀行' },
]

const pick = (obj, keys) => {
  for (const key of keys) {
    if (typeof obj?.[key] === 'string' && obj[key].trim()) {
      return obj[key].trim()
    }
  }
  return ''
}

const normalizeRows = (rows) => {
  const seen = new Set()
  const result = []

  for (const row of rows ?? []) {
    const bankName = pick(row, [
      '機構名稱',
      'bank_name',
      'BankName',
      '金融機構名稱',
      '總機構名稱',
    ])
    if (!bankName) continue

    const bankCode = pick(row, [
      '機構代號',
      'bank_code',
      'BankCode',
      '金融機構代號',
      '總機構代號',
    ])

    const key = `${bankCode}_${bankName}`
    if (seen.has(key)) continue
    seen.add(key)

    result.push({
      bankCode: bankCode || undefined,
      bankName,
    })
  }

  result.sort((a, b) => a.bankName.localeCompare(b.bankName, 'zh-Hant'))
  return result
}

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.rows)) return []
    return parsed.rows
  } catch {
    return []
  }
}

const writeCache = (rows) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        rows,
      }),
    )
  } catch {
    // Ignore localStorage write failures.
  }
}

const isCacheFresh = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Number(parsed?.savedAt) > Date.now() - CACHE_EXPIRES_MS
  } catch {
    return false
  }
}

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Bank directory API error: ${response.status}`)
  }
  return response.json()
}

const fetchFromApi = async () => {
  const [fiscData, branchData] = await Promise.allSettled([
    fetchJson(FISC_URL),
    fetchJson(BRANCH_URL),
  ])

  const rows = []
  if (fiscData.status === 'fulfilled') {
    rows.push(...(fiscData.value?.result?.records ?? []))
  }
  if (branchData.status === 'fulfilled') {
    rows.push(...(branchData.value?.result?.records ?? []))
  }

  const normalized = normalizeRows(rows)
  if (normalized.length === 0) {
    throw new Error('No bank directory data available from APIs')
  }
  return normalized
}

export const getBankDirectory = async () => {
  const cachedRows = readCache()

  if (isCacheFresh() && cachedRows.length > 0) {
    fetchFromApi()
      .then((rows) => writeCache(rows))
      .catch(() => {})
    return cachedRows
  }

  try {
    const rows = await fetchFromApi()
    writeCache(rows)
    return rows
  } catch (error) {
    if (cachedRows.length > 0) {
      return cachedRows
    }
    writeCache(FALLBACK_BANKS)
    return FALLBACK_BANKS
  }
}
