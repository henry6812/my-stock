const DEV_MODE = Boolean(import.meta?.env?.DEV)

const warnInvalidNumeric = (value, fallback, context) => {
  if (!DEV_MODE) {
    return
  }
  const contextText = context ? ` (${context})` : ''
  console.warn(
    `[numeric] invalid value${contextText}, fallback to ${fallback}:`,
    value,
  )
}

export const parseNumericLike = (value, options = {}) => {
  const { fallback = 0, context = '' } = options

  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value
    }
    warnInvalidNumeric(value, fallback, context)
    return fallback
  }

  if (typeof value === 'bigint') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
    warnInvalidNumeric(value, fallback, context)
    return fallback
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return fallback
    }

    const normalized = trimmed
      .replace(/,/g, '')
      .replace(/\s+/g, '')
      .replace(/[^0-9+\-eE.]/g, '')

    if (!normalized) {
      warnInvalidNumeric(value, fallback, context)
      return fallback
    }

    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) {
      return parsed
    }
    warnInvalidNumeric(value, fallback, context)
    return fallback
  }

  if (value === null || value === undefined) {
    return fallback
  }

  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  warnInvalidNumeric(value, fallback, context)
  return fallback
}
