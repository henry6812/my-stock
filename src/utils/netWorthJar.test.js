import { describe, expect, it } from 'vitest'
import { getAssetAnimationPlan, getJarGeometry, getPrincipalTwd, JAR_UNIT_TWD } from './netWorthJar'

describe('getJarGeometry', () => {
  it('fills the first 千萬 jar on an up day', () => {
    const g = getJarGeometry({ totalTwd: 6_384_200, baselineTwd: 6_301_000 })
    expect(g.floorTwd).toBe(0)
    expect(g.capTwd).toBe(JAR_UNIT_TWD)
    expect(g.totalTwd).toBe(6_380_000)
    expect(g.levelRatio).toBeCloseTo(0.638)
    expect(g.baselineRatio).toBeCloseTo(0.63)
    expect(g.hasBaseline).toBe(true)
    expect(g.direction).toBe('up')
    expect(g.crossedMilestone).toBe(false)
    expect(g.gapToCapTwd).toBe(3_620_000)
    expect(g.isEmpty).toBe(false)
  })

  it('reports a down day', () => {
    const g = getJarGeometry({ totalTwd: 6_218_500, baselineTwd: 6_301_000 })
    expect(g.direction).toBe('down')
    expect(g.levelRatio).toBeCloseTo(0.621)
    expect(g.baselineRatio).toBeCloseTo(0.63)
  })

  it('reports a flat day', () => {
    const g = getJarGeometry({ totalTwd: 6_300_000, baselineTwd: 6_300_000 })
    expect(g.direction).toBe('flat')
  })

  it('raises the cap and flags the milestone when crossing a 千萬 upward', () => {
    const g = getJarGeometry({ totalTwd: 10_046_000, baselineTwd: 9_982_000 })
    expect(g.floorTwd).toBe(10_000_000)
    expect(g.capTwd).toBe(20_000_000)
    expect(g.levelRatio).toBeCloseTo(0.502)
    expect(g.baselineRatio).toBeCloseTo(0.4991)
    expect(g.crossedMilestone).toBe(true)
    expect(g.direction).toBe('up')
  })

  it('fills an exact 千萬 total halfway up the next jar', () => {
    const g = getJarGeometry({ totalTwd: 10_000_000, baselineTwd: 10_000_000 })
    expect(g.floorTwd).toBe(10_000_000)
    expect(g.capTwd).toBe(20_000_000)
    expect(g.levelRatio).toBe(0.5)
    expect(g.crossedMilestone).toBe(false)
    expect(g.baselineRatio).toBe(0.5)
  })

  it('clamps a baseline above the cap when crossing down', () => {
    const g = getJarGeometry({ totalTwd: 9_950_000, baselineTwd: 10_050_000 })
    expect(g.floorTwd).toBe(0)
    expect(g.baselineRatio).toBe(1)
    expect(g.direction).toBe('down')
    expect(g.crossedMilestone).toBe(false)
  })

  it('treats a missing baseline as no baseline', () => {
    const g = getJarGeometry({ totalTwd: 12_000_000, baselineTwd: 0 })
    expect(g.hasBaseline).toBe(false)
    expect(g.baselineRatio).toBeNull()
    expect(g.crossedMilestone).toBe(false)
    expect(g.direction).toBe('flat')
  })

  it('marks an empty jar for zero or invalid totals', () => {
    expect(getJarGeometry({ totalTwd: 0, baselineTwd: 0 }).isEmpty).toBe(true)
    const g = getJarGeometry({ totalTwd: 'abc', baselineTwd: undefined })
    expect(g.isEmpty).toBe(true)
    expect(g.capTwd).toBe(JAR_UNIT_TWD)
    expect(g.levelRatio).toBe(0)
  })

  it('accepts numeric strings', () => {
    expect(getJarGeometry({ totalTwd: '6384200', baselineTwd: '6301000' }).levelRatio).toBeCloseTo(0.638)
  })
})

describe('getAssetAnimationPlan', () => {
  it('replays the jar entrance only on the first load', () => {
    expect(getAssetAnimationPlan({ isInitialLoad: true, numbersRequested: false })).toEqual({
      animateNumbers: true,
      replayJar: true,
    })
  })

  it('counts up numbers but lets the jar glide on a price refresh', () => {
    expect(getAssetAnimationPlan({ isInitialLoad: false, numbersRequested: true })).toEqual({
      animateNumbers: true,
      replayJar: false,
    })
  })

  it('animates nothing on a plain background reload', () => {
    expect(getAssetAnimationPlan({ isInitialLoad: false, numbersRequested: false })).toEqual({
      animateNumbers: false,
      replayJar: false,
    })
  })
})

describe('getPrincipalTwd', () => {
  it('subtracts the holdings\' unrealized gain from the total', () => {
    const rows = [
      { market: 'TW', latestValueTwd: 1_200_000, totalCost: 1_000_000 },
      { market: 'US', latestValueTwd: 640_000, totalCost: 25_000, fxRateToTwd: 32 },
    ]
    // gains: 200,000 + (640,000 − 800,000) = 40,000
    expect(getPrincipalTwd({ totalTwd: 3_000_000, rows })).toEqual({
      principalTwd: 2_960_000,
      unsetCount: 0,
    })
  })

  it('counts holdings without a cost at their value and reports them', () => {
    const rows = [
      { market: 'TW', latestValueTwd: 500_000, totalCost: null },
      { market: 'US', latestValueTwd: 300_000, totalCost: 9_000 },
      { market: 'TW', latestValueTwd: undefined, totalCost: 100 },
    ]
    expect(getPrincipalTwd({ totalTwd: 2_000_000, rows })).toEqual({
      principalTwd: 2_000_000,
      unsetCount: 2,
    })
  })
})

describe('getJarGeometry principal', () => {
  it('places the principal under the water on a gain', () => {
    const g = getJarGeometry({ totalTwd: 6_384_200, baselineTwd: 6_301_000, principalTwd: 5_208_000 })
    expect(g.principalTwd).toBe(5_200_000)
    expect(g.principalRatio).toBeCloseTo(0.52)
    expect(g.inLoss).toBe(false)
  })

  it('reports a loss when the principal is above the water', () => {
    const g = getJarGeometry({ totalTwd: 6_384_200, baselineTwd: 0, principalTwd: 7_000_000 })
    expect(g.principalRatio).toBeCloseTo(0.7)
    expect(g.inLoss).toBe(true)
  })

  it('measures the principal from 0 in a jar past the first 千萬', () => {
    const g = getJarGeometry({ totalTwd: 10_460_000, baselineTwd: 0, principalTwd: 9_800_000 })
    expect(g.principalRatio).toBeCloseTo(0.49)
    expect(g.inLoss).toBe(false)
  })

  it('has no principal layer without a principal or water', () => {
    expect(getJarGeometry({ totalTwd: 6_384_200, baselineTwd: 0 }).principalRatio).toBeNull()
    expect(getJarGeometry({ totalTwd: 0, baselineTwd: 0, principalTwd: 0 }).principalRatio).toBeNull()
  })
})
