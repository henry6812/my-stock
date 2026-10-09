import { describe, expect, it } from 'vitest'
import { getAssetAnimationPlan, getJarGeometry, JAR_UNIT_TWD } from './netWorthJar'

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

  it('starts a new jar and flags the milestone when crossing a 千萬 upward', () => {
    const g = getJarGeometry({ totalTwd: 10_046_000, baselineTwd: 9_982_000 })
    expect(g.floorTwd).toBe(10_000_000)
    expect(g.capTwd).toBe(20_000_000)
    expect(g.levelRatio).toBeCloseTo(0.004)
    expect(g.baselineRatio).toBeNull()
    expect(g.crossedMilestone).toBe(true)
    expect(g.direction).toBe('up')
  })

  it('puts an exact 千萬 total at the bottom of the next jar', () => {
    const g = getJarGeometry({ totalTwd: 10_000_000, baselineTwd: 10_000_000 })
    expect(g.floorTwd).toBe(10_000_000)
    expect(g.levelRatio).toBe(0)
    expect(g.crossedMilestone).toBe(false)
    expect(g.baselineRatio).toBe(0)
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
