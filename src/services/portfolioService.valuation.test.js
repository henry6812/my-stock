import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
}))

import { db } from '../db/database'
import { assertCloudWriteReady, writeCollectionRecord } from './firebase/cloudSyncService'
import { getValuationSettings, saveValuationSettings } from './portfolioService'
import { EMPTY_VALUATION_SETTINGS } from '../utils/valuation'

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
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toEqual(EMPTY_VALUATION_SETTINGS)
  })

  it('merges a patch, mirrors it to the cloud and reads it back', async () => {
    await save({ market: 'TW', symbol: '2330', patch: { peFair: 18 } })
    await save({ market: 'TW', symbol: '2330', patch: { forwardEps: '81.5' } })
    expect(writeCollectionRecord).toHaveBeenCalledTimes(2)
    expect(writeCollectionRecord.mock.calls[1][0]).toMatchObject({
      collectionName: 'app_config',
      record: { key: 'valuation:TW_2330', valuation: { peFair: 18, forwardEps: 81.5 } },
    })
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toMatchObject({ peFair: 18, forwardEps: 81.5 })
  })

  it('resets a field with null and keeps settings per stock', async () => {
    await save({ market: 'TW', symbol: '2330', patch: { peFair: 18, peCheap: 12 } })
    await save({ market: 'TW', symbol: '2330', patch: { peFair: null } })
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).toMatchObject({ peFair: null, peCheap: 12 })
    expect(await getValuationSettings({ market: 'US', symbol: '2330' })).toMatchObject({ peCheap: null })
  })

  it('rejects invalid values and unknown fields', async () => {
    await expect(save({ market: 'TW', symbol: '2330', patch: { peFair: 0 } })).rejects.toThrow('本益比必須大於 0')
    await expect(save({ market: 'TW', symbol: '2330', patch: { growthRate: 0.1 } })).rejects.toThrow('growthRate')
    await expect(save({ market: 'TW', symbol: '2330', patch: { forwardEps: 'abc' } })).rejects.toThrow('數字')
    await expect(save({ market: 'TW', symbol: '2330', patch: { foo: 1 } })).rejects.toThrow('foo')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })

  it('drops a legacy growthRate synced from an older version', async () => {
    await db.app_config.put({
      key: 'valuation:TW_2330',
      valuation: { peFair: 18, growthRate: 0.15 },
      updatedAt: '2026-10-01T00:00:00.000Z',
      deletedAt: null,
    })
    expect(await getValuationSettings({ market: 'TW', symbol: '2330' })).not.toHaveProperty('growthRate')
    await save({ market: 'TW', symbol: '2330', patch: { peCheap: 12 } })
    expect(writeCollectionRecord.mock.calls[0][0].record.valuation).not.toHaveProperty('growthRate')
  })

  it('merges model assumptions, clearing a field with null', async () => {
    await save({
      market: 'TW',
      symbol: '2330',
      patch: { model: { global: { grossMargin: '0.55', nonOperating: -1200 }, quarters: { '2026Q4': { opexRatio: 0.1 } } } },
    })
    await save({
      market: 'TW',
      symbol: '2330',
      patch: { model: { global: { grossMargin: null }, quarters: { '2026Q4': { opexRatio: null }, '2027Q1': { taxRate: 0.18 } } } },
    })
    const settings = await getValuationSettings({ market: 'TW', symbol: '2330' })
    expect(settings.model.global).toMatchObject({ grossMargin: null, nonOperating: -1200 })
    expect(settings.model.quarters).toEqual({ '2027Q1': { taxRate: 0.18 } })
  })

  it('validates model assumptions', async () => {
    const patch = (global) => save({ market: 'TW', symbol: '2330', patch: { model: { global } } })
    await expect(patch({ revenueYoy: -1 })).rejects.toThrow('營收 YoY 必須大於 -100%')
    await expect(patch({ grossMargin: 1.2 })).rejects.toThrow('毛利率必須介於 -100% 與 100%')
    await expect(patch({ opexRatio: -0.1 })).rejects.toThrow('營業費用率必須介於 0% 與 100%')
    await expect(patch({ taxRate: 1.5 })).rejects.toThrow('稅率必須介於 0% 與 100%')
    await expect(patch({ nciRatio: -0.1 })).rejects.toThrow('非控制權益比必須介於 0% 與 100%')
    await expect(patch({ foo: 1 })).rejects.toThrow('foo')
    await expect(
      save({ market: 'TW', symbol: '2330', patch: { model: { quarters: { '2026Q5': { taxRate: 0.2 } } } } }),
    ).rejects.toThrow('2026Q5')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })

  it('records a snapshot, drops overrides of published quarters and keeps 8 snapshots', async () => {
    await save({
      market: 'TW',
      symbol: '2330',
      patch: { model: { quarters: { '2026Q2': { grossMargin: 0.5 }, '2026Q4': { grossMargin: 0.55 } } } },
    })
    for (let index = 0; index < 9; index += 1) {
      const year = 2024 + Math.floor(index / 4)
      const quarter = (index % 4) + 1
      await save({
        market: 'TW',
        symbol: '2330',
        patch: {},
        snapshot: { quarter: `${year}Q${quarter}`, eps: index, revenue: 100, grossMargin: 0.5, opexRatio: 0.2 },
      })
    }
    await save({
      market: 'TW',
      symbol: '2330',
      patch: {},
      snapshot: { quarter: '2026Q3', eps: 3.4, revenue: 1350, grossMargin: 0.5, opexRatio: 0.2 },
    })
    const settings = await getValuationSettings({ market: 'TW', symbol: '2330' })
    expect(settings.model.quarters).toEqual({ '2026Q4': { grossMargin: 0.55 } })
    expect(Object.keys(settings.snapshots).sort()).toEqual([
      '2024Q3', '2024Q4', '2025Q1', '2025Q2', '2025Q3', '2025Q4', '2026Q1', '2026Q3',
    ])
    expect(settings.snapshots['2026Q3']).toEqual({
      eps: 3.4,
      revenue: 1350,
      grossMargin: 0.5,
      opexRatio: 0.2,
      savedAt: expect.any(String),
    })
  })

  it('refuses to write when the cloud is not writable (not signed in)', async () => {
    assertCloudWriteReady.mockImplementation(() => {
      throw new Error('請先登入')
    })
    await expect(save({ market: 'TW', symbol: '2330', patch: { peFair: 18 } })).rejects.toThrow('請先登入')
    expect(writeCollectionRecord).not.toHaveBeenCalled()
  })
})
