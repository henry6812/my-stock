const toIso = (value) => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString()
  }
  return null
}

export const buildHoldingKey = ({ market, symbol }) => `${market}_${symbol}`

export const buildSnapshotKey = ({ market, symbol, capturedAt }) => (
  `${market}_${symbol}_${capturedAt}`
)

export const buildCashAccountKey = ({ bankCode, bankName, accountAlias }) => (
  `${bankCode || 'NA'}_${String(bankName || '').trim()}_${String(accountAlias || '').trim()}`
    .replaceAll('/', '_')
)

export const holdingToRemote = (holding) => ({
  symbol: holding.symbol,
  market: holding.market,
  assetTag: holding.assetTag ?? 'STOCK',
  shares: holding.shares,
  companyName: holding.companyName,
  sortOrder: holding.sortOrder,
  createdAt: holding.createdAt ?? null,
  updatedAt: holding.updatedAt,
  deletedAt: holding.deletedAt ?? null,
  clientUpdatedAt: holding.updatedAt,
})

export const snapshotToRemote = (snapshot) => ({
  symbol: snapshot.symbol,
  market: snapshot.market,
  price: snapshot.price,
  currency: snapshot.currency,
  fxRateToTwd: snapshot.fxRateToTwd,
  valueTwd: snapshot.valueTwd,
  capturedAt: snapshot.capturedAt,
  updatedAt: snapshot.updatedAt,
  deletedAt: snapshot.deletedAt ?? null,
  clientUpdatedAt: snapshot.updatedAt,
})

export const fxRateToRemote = (rate) => ({
  pair: rate.pair,
  rate: rate.rate,
  fetchedAt: rate.fetchedAt,
  source: rate.source,
  updatedAt: rate.updatedAt,
  deletedAt: rate.deletedAt ?? null,
  clientUpdatedAt: rate.updatedAt,
})

export const syncMetaToRemote = (meta) => ({
  key: meta.key,
  lastUpdatedAt: meta.lastUpdatedAt ?? null,
  status: meta.status ?? null,
  errorMessage: meta.errorMessage ?? '',
  updatedAt: meta.updatedAt,
  deletedAt: meta.deletedAt ?? null,
  clientUpdatedAt: meta.updatedAt,
})

export const cashAccountToRemote = (cashAccount) => ({
  bankCode: cashAccount.bankCode ?? null,
  bankName: cashAccount.bankName,
  accountAlias: cashAccount.accountAlias,
  balanceTwd: cashAccount.balanceTwd,
  createdAt: cashAccount.createdAt ?? null,
  updatedAt: cashAccount.updatedAt,
  deletedAt: cashAccount.deletedAt ?? null,
  clientUpdatedAt: cashAccount.updatedAt,
})

export const remoteToHolding = (data) => ({
  symbol: data.symbol,
  market: data.market,
  assetTag: data.assetTag ?? 'STOCK',
  shares: data.shares,
  companyName: data.companyName,
  sortOrder: data.sortOrder,
  createdAt: toIso(data.createdAt) ?? data.createdAt ?? null,
  updatedAt: toIso(data.updatedAt) ?? data.clientUpdatedAt ?? null,
  deletedAt: toIso(data.deletedAt),
})

export const remoteToSnapshot = (data) => ({
  symbol: data.symbol,
  market: data.market,
  price: data.price,
  currency: data.currency,
  fxRateToTwd: data.fxRateToTwd,
  valueTwd: data.valueTwd,
  capturedAt: toIso(data.capturedAt) ?? data.capturedAt,
  updatedAt: toIso(data.updatedAt) ?? data.clientUpdatedAt ?? null,
  deletedAt: toIso(data.deletedAt),
})

export const remoteToFxRate = (data) => ({
  pair: data.pair,
  rate: data.rate,
  fetchedAt: toIso(data.fetchedAt) ?? data.fetchedAt,
  source: data.source,
  updatedAt: toIso(data.updatedAt) ?? data.clientUpdatedAt ?? null,
  deletedAt: toIso(data.deletedAt),
})

export const remoteToSyncMeta = (data) => ({
  key: data.key,
  lastUpdatedAt: toIso(data.lastUpdatedAt) ?? data.lastUpdatedAt ?? null,
  status: data.status ?? null,
  errorMessage: data.errorMessage ?? '',
  updatedAt: toIso(data.updatedAt) ?? data.clientUpdatedAt ?? null,
  deletedAt: toIso(data.deletedAt),
})

export const remoteToCashAccount = (data) => ({
  bankCode: data.bankCode ?? undefined,
  bankName: data.bankName,
  accountAlias: data.accountAlias,
  balanceTwd: data.balanceTwd,
  createdAt: toIso(data.createdAt) ?? data.createdAt ?? null,
  updatedAt: toIso(data.updatedAt) ?? data.clientUpdatedAt ?? null,
  deletedAt: toIso(data.deletedAt),
})

export const isRemoteNewer = (localUpdatedAt, remoteUpdatedAt) => {
  if (!remoteUpdatedAt) return false
  if (!localUpdatedAt) return true
  return remoteUpdatedAt > localUpdatedAt
}
