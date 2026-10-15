import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./firebase/cloudSyncService', async (importOriginal) => ({
  ...(await importOriginal()),
  assertCloudWriteReady: vi.fn(),
  writeCollectionRecord: vi.fn(),
}))

import { db } from '../db/database'
import { writeCollectionRecord } from './firebase/cloudSyncService'
import { getScreenSettings, listValuationOverrideSymbols, saveScreenSettings, saveValuationSettings } from './portfolioService'
import { DEFAULT_SCREEN_SETTINGS } from '../utils/stockScreen'

let clock = Date.parse('2026-10-15T00:00:00.000Z')
const tick = () => {
  clock += 1000
  vi.setSystemTime(clock)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await db.app_config.clear()
  writeCollectionRecord.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('screen settings', () => {
  it('reads the defaults when nothing is stored', async () => {
    expect(await getScreenSettings()).toEqual(DEFAULT_SCREEN_SETTINGS)
  })

  it('saves normalized settings, mirrors them and reads them back', async () => {
    tick()
    await saveScreenSettings({ industries: ['24'], flags: { epsSpike: { enabled: false, maxGrowth: -3 } } })
    expect(writeCollectionRecord.mock.calls[0][0]).toMatchObject({
      collectionName: 'app_config',
      record: { key: 'stock_screen:settings', screen: { industries: ['24'] } },
    })
    const stored = await getScreenSettings()
    expect(stored.industries).toEqual(['24'])
    expect(stored.flags.epsSpike).toEqual({ enabled: false, maxGrowth: 2 })
  })

  it('lists stocks with valuation overrides for a market', async () => {
    tick()
    await saveValuationSettings({ market: 'TW', symbol: '2330', patch: { peFair: 18 } })
    tick()
    await saveValuationSettings({ market: 'US', symbol: 'AAPL', patch: { peFair: 30 } })
    expect(await listValuationOverrideSymbols('TW')).toEqual(['2330'])
  })
})
