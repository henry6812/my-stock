import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
}))

import { db } from '../db/database'
import { assertCloudWriteReady, writeCollectionRecord } from './firebase/cloudSyncService'
import { getValuationSettings, saveValuationSettings } from './portfolioService'

// app_config applies a write only when it is newer than the local row, so
// each save in a test needs its own timestamp (UI saves are never 1 ms apart).
let clock = Date.parse('2026-10-05T00:00:00.000Z')
const save = (input) => {
  clock += 1000
  vi.setSystemTime(clock)
  return saveValuationSettings(input)
}

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await db.app_config.clear()
  assertCloudWriteReady.mockReset()
  writeCollectionRecord.mockReset()
})

describe('valuation settings', () => {
  it('returns all-null settings when nothing is stored', async () => {
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toEqual({
      peCheap: null,
      peFair: null,
      peExpensive: null,
      growthRate: null,
      forwardEps: null,
    })
  })

  it('merges a patch, mirrors it to the cloud and reads it back', async () => {
    await save({ market: 'TW', symbol: '2330', patch: { peFair: 18 } })
    await save({ market: 'TW', symbol: '2330', patch: { growthRate: '0.15' } })
    expect(writeCollectionRecord).toHaveBeenCalledTimes(2)
    expect(writeCollectionRecord.mock.calls[1][0]).toMatchObject({
      collectionName: 'app_config',
      record: { key: 'valuation:TW_2330', valuation: { peFair: 18, growthRate: 0.15 } },
    })
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toMatchObject({ peFair: 18, growthRate: 0.15 })
  })

  it('resets a field with null and keeps settings per stock', async () => {
    await save({ market: 'TW', symbol: '2330', patch: { peFair: 18, peCheap: 12 } })
    await save({ market: 'TW', symbol: '2330', patch: { peFair: null } })
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toMatchObject({ peFair: null, peCheap: 12 })
    expect(await getValuationSettings({ market: 'US', symbol: '2330' })).toMatchObject({ peCheap: null })
  })

  it('rejects invalid values and unknown fields', async () => {
    await expect(save({ market: 'TW', symbol: '2330', patch: { peFair: 0 } })).rejects.toThrow('本益比必須大於 0')
    await expect(save({ market: 'TW', symbol: '2330', patch: { growthRate: -1 } })).rejects.toThrow('成長率')
    await expect(save({ market: 'TW', symbol: '2330', patch: { forwardEps: 'abc' } })).rejects.toThrow('數字')
    await expect(save({ market: 'TW', symbol: '2330', patch: { foo: 1 } })).rejects.toThrow('foo')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })

  it('refuses to write when the cloud is not writable (not signed in)', async () => {
    assertCloudWriteReady.mockImplementation(() => {
      throw new Error('請先登入')
    })
    await expect(save({ market: 'TW', symbol: '2330', patch: { peFair: 18 } })).rejects.toThrow('請先登入')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })
})
