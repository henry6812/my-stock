import { describe, expect, it } from 'vitest'
import { MAX_TILT_DEG, stepSpring, tiltFromOrientation } from './deviceTilt'

describe('tiltFromOrientation', () => {
  it('is level when the phone is held upright and straight', () => {
    expect(tiltFromOrientation({ beta: 60, gamma: 0 })).toBeCloseTo(0)
  })

  it('leans with the phone, right side down positive', () => {
    const right = tiltFromOrientation({ beta: 60, gamma: 20 })
    expect(right).toBeGreaterThan(5)
    expect(right).toBeLessThan(15)
    expect(tiltFromOrientation({ beta: 60, gamma: -20 })).toBeCloseTo(-right)
  })

  it('caps the lean', () => {
    expect(tiltFromOrientation({ beta: 20, gamma: 80 })).toBeCloseTo(MAX_TILT_DEG)
  })

  it('fades out when the phone lies flat', () => {
    expect(tiltFromOrientation({ beta: 0, gamma: 2 })).toBe(0)
    expect(Math.abs(tiltFromOrientation({ beta: 3, gamma: 10 }))).toBeLessThan(MAX_TILT_DEG * 0.5)
  })

  it('ignores missing readings', () => {
    expect(tiltFromOrientation({ beta: null, gamma: null })).toBe(0)
  })
})

describe('stepSpring', () => {
  it('overshoots the target and then settles on it', () => {
    let state = { value: 0, velocity: 0 }
    let peak = 0
    for (let n = 0; n < 600; n += 1) {
      state = stepSpring(state, 10, 0.02, 0.12)
      peak = Math.max(peak, state.value)
    }
    expect(peak).toBeGreaterThan(10)
    expect(state.value).toBeCloseTo(10, 3)
  })
})
