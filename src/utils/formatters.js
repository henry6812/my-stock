import dayjs from 'dayjs'

export const formatTwd = (value, compact = false) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--'
  }

  const rounded = Math.round(value)

  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  }).format(rounded)
}

export const formatPrice = (value, currency = 'TWD') => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--'
  }

  // zh-TW: TWD renders as "$", USD as "US$" — same "$" as formatTwd totals.
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency,
    maximumFractionDigits: 4,
  }).format(value)
}

export const formatDateTime = (value) => {
  if (!value) {
    return '--'
  }

  return dayjs(value).format('YYYY/MM/DD HH:mm:ss')
}

export const formatDate = (value) => {
  if (!value) {
    return '--'
  }

  return dayjs(value).format('YYYY/MM/DD')
}

// Chart axis ticks: one unit (萬) everywhere, one decimal only when small.
export const formatAxisTwd = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return ''
  }
  if (number === 0) {
    return '0'
  }
  const inTenThousands = number / 10000
  return Math.abs(inTenThousands) >= 10
    ? `${Math.round(inTenThousands)}萬`
    : `${Number(inTenThousands.toFixed(1))}萬`
}

export const formatRelativeTime = (value, now = Date.now()) => {
  const ms = dayjs(value).valueOf()
  if (!value || !Number.isFinite(ms)) {
    return '尚未更新'
  }
  const diffMinutes = Math.max(0, Math.floor((now - ms) / 60000))
  if (diffMinutes < 1) {
    return '剛剛'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分鐘前`
  }
  if (diffMinutes < 1440) {
    return `${Math.floor(diffMinutes / 60)} 小時前`
  }
  return `${Math.floor(diffMinutes / 1440)} 天前`
}
