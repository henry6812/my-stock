const MIN_SENTINEL = Symbol('db-min')
const MAX_SENTINEL = Symbol('db-max')

export const DB_MIN_KEY = MIN_SENTINEL
export const DB_MAX_KEY = MAX_SENTINEL

const isObject = (value) => value !== null && typeof value === 'object'

const cloneRow = (row) => ({ ...row })

const comparePrimitive = (a, b) => {
  if (a === b) return 0
  if (a === MIN_SENTINEL || b === MAX_SENTINEL) return -1
  if (a === MAX_SENTINEL || b === MIN_SENTINEL) return 1
  if (a == null && b != null) return -1
  if (a != null && b == null) return 1
  return a < b ? -1 : 1
}

const compareKey = (a, b) => {
  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray && bIsArray) {
    const maxLen = Math.max(a.length, b.length)
    for (let i = 0; i < maxLen; i += 1) {
      const result = comparePrimitive(a[i], b[i])
      if (result !== 0) {
        return result
      }
    }
    return 0
  }
  return comparePrimitive(a, b)
}

const toComparable = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => toComparable(item))
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return value
}

const parseCompositeIndex = (indexName) => {
  if (!indexName) return null
  const match = String(indexName).match(/^\[(.+)\]$/)
  if (!match) return null
  return match[1].split('+').map((field) => field.trim()).filter(Boolean)
}

const normalizePrimaryKey = (key) => String(key || '').replace(/^(\+\+|&)/, '')

const valueAtIndex = (row, indexName) => {
  const composite = parseCompositeIndex(indexName)
  if (composite) {
    return composite.map((field) => toComparable(row[field]))
  }
  const normalized = normalizePrimaryKey(indexName)
  return toComparable(row[normalized])
}

class InMemoryQuery {
  constructor(table, indexName, filters = [], reversed = false) {
    this.table = table
    this.indexName = indexName
    this.filters = filters
    this.reversed = reversed
  }

  _withFilter(predicate) {
    return new InMemoryQuery(
      this.table,
      this.indexName,
      [...this.filters, predicate],
      this.reversed,
    )
  }

  equals(expected) {
    const normalized = toComparable(expected)
    return this._withFilter((row) => compareKey(valueAtIndex(row, this.indexName), normalized) === 0)
  }

  anyOf(expectedList) {
    const normalizedList = expectedList.map((item) => toComparable(item))
    return this._withFilter((row) => {
      const value = valueAtIndex(row, this.indexName)
      return normalizedList.some((target) => compareKey(value, target) === 0)
    })
  }

  between(lower, upper, includeLower = true, includeUpper = true) {
    const normalizedLower = toComparable(lower)
    const normalizedUpper = toComparable(upper)
    return this._withFilter((row) => {
      const value = valueAtIndex(row, this.indexName)
      const lowerResult = compareKey(value, normalizedLower)
      const upperResult = compareKey(value, normalizedUpper)
      const lowerPass = includeLower ? lowerResult >= 0 : lowerResult > 0
      const upperPass = includeUpper ? upperResult <= 0 : upperResult < 0
      return lowerPass && upperPass
    })
  }

  and(predicate) {
    return this._withFilter(predicate)
  }

  reverse() {
    return new InMemoryQuery(this.table, this.indexName, this.filters, !this.reversed)
  }

  async toArray() {
    let rows = this.table.rows.filter((row) => this.filters.every((filter) => filter(row)))
    if (this.reversed) {
      rows = [...rows].reverse()
    }
    return rows.map((row) => cloneRow(row))
  }

  async first() {
    const rows = await this.toArray()
    return rows[0]
  }

  async count() {
    const rows = await this.toArray()
    return rows.length
  }

  async sortBy(field) {
    const rows = await this.toArray()
    rows.sort((a, b) => comparePrimitive(toComparable(a[field]), toComparable(b[field])))
    return rows
  }

  async delete() {
    const rows = await this.toArray()
    const ids = new Set(rows.map((row) => row[this.table.primaryKey]))
    const before = this.table.rows.length
    this.table.rows = this.table.rows.filter((row) => !ids.has(row[this.table.primaryKey]))
    return before - this.table.rows.length
  }
}

class InMemoryTable {
  constructor({ primaryKey = 'id', autoIncrement = false }) {
    this.primaryKey = primaryKey
    this.autoIncrement = autoIncrement
    this.rows = []
    this.autoIncrementValue = 1
  }

  _nextId() {
    const id = this.autoIncrementValue
    this.autoIncrementValue += 1
    return id
  }

  async toArray() {
    return this.rows.map((row) => cloneRow(row))
  }

  async get(key) {
    const found = this.rows.find((row) => compareKey(toComparable(row[this.primaryKey]), toComparable(key)) === 0)
    return found ? cloneRow(found) : undefined
  }

  async add(data) {
    const row = cloneRow(data)
    if (this.autoIncrement && row[this.primaryKey] == null) {
      row[this.primaryKey] = this._nextId()
    }
    if (!this.autoIncrement && row[this.primaryKey] == null) {
      throw new Error(`Missing primary key "${this.primaryKey}"`)
    }
    this.rows.push(row)
    return row[this.primaryKey]
  }

  async put(data) {
    const row = cloneRow(data)
    if (this.autoIncrement && row[this.primaryKey] == null) {
      row[this.primaryKey] = this._nextId()
      this.rows.push(row)
      return row[this.primaryKey]
    }
    const key = row[this.primaryKey]
    if (key == null) {
      throw new Error(`Missing primary key "${this.primaryKey}"`)
    }
    const index = this.rows.findIndex(
      (item) => compareKey(toComparable(item[this.primaryKey]), toComparable(key)) === 0,
    )
    if (index >= 0) {
      this.rows[index] = row
    } else {
      this.rows.push(row)
    }
    return key
  }

  async update(key, changes) {
    const index = this.rows.findIndex(
      (item) => compareKey(toComparable(item[this.primaryKey]), toComparable(key)) === 0,
    )
    if (index < 0) {
      return 0
    }
    const updated = { ...this.rows[index], ...cloneRow(changes) }
    this.rows[index] = updated
    return 1
  }

  async delete(key) {
    const before = this.rows.length
    this.rows = this.rows.filter(
      (item) => compareKey(toComparable(item[this.primaryKey]), toComparable(key)) !== 0,
    )
    return before - this.rows.length
  }

  async clear() {
    this.rows = []
    this.autoIncrementValue = 1
  }

  async bulkAdd(items) {
    for (const item of items) {
      await this.add(item)
    }
  }

  where(indexName) {
    return new InMemoryQuery(this, indexName)
  }
}

class StockDatabase {
  constructor() {
    this.holdings = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
    this.price_snapshots = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
    this.fx_rates = new InMemoryTable({ primaryKey: 'pair' })
    this.sync_meta = new InMemoryTable({ primaryKey: 'key' })
    this.expense_entries = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
    this.cash_accounts = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
    this.app_config = new InMemoryTable({ primaryKey: 'key' })
    this.outbox = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
    this.cash_balance_snapshots = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
    this.expense_categories = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
    this.budgets = new InMemoryTable({ primaryKey: 'id', autoIncrement: true })
  }

  async transaction(_mode, ...args) {
    const callback = args[args.length - 1]
    if (typeof callback === 'function') {
      return callback()
    }
    return undefined
  }
}

export const db = new StockDatabase()

export const SYNC_KEY_PRICES = 'prices'
export const FX_PAIR_USD_TWD = 'USD_TWD'

export const isInMemoryDb = true
export const hasPersistentLocalDb = false
export const isIndexedDbEnabled = false
