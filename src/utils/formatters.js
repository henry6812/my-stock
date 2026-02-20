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

  return new Intl.NumberFormat('en-US', {
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
