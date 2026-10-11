import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('tilt switch', () => {
  // The module keeps the switch and the per-launch ask in module state, so each
  // test starts from a fresh copy, as a fresh app launch would.
  const load = async () => {
    vi.resetModules()
    return import('./deviceTilt')
  }

  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('is off until turned on, and stays on across launches', async () => {
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: vi.fn(() => Promise.resolve('granted')) })
    const first = await load()
    expect(first.isTiltEnabled()).toBe(false)
    await expect(first.enableTiltFromTap()).resolves.toBe(true)
    expect((await load()).isTiltEnabled()).toBe(true)
  })

  it('turns back off when iOS is refused', async () => {
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: vi.fn(() => Promise.resolve('denied')) })
    const tilt = await load()
    await expect(tilt.enableTiltFromTap()).resolves.toBe(false)
    expect(tilt.isTiltEnabled()).toBe(false)
    expect((await load()).isTiltEnabled()).toBe(false)
  })

  it('asks again on a jar tap after iOS has forgotten, once per launch', async () => {
    window.localStorage.setItem('my-stock:tilt-enabled', '1')
    const requestPermission = vi
      .fn()
      .mockReturnValueOnce(Promise.reject(new Error('needs a tap')))
      .mockReturnValue(Promise.resolve('granted'))
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission })
    const tilt = await load()
    tilt.checkTiltPermission()
    await Promise.resolve()
    tilt.requestTiltPermission()
    tilt.requestTiltPermission()
    expect(requestPermission).toHaveBeenCalledTimes(2)
  })

  it('does not ask on the jar tap when iOS still holds the permission', async () => {
    window.localStorage.setItem('my-stock:tilt-enabled', '1')
    const requestPermission = vi.fn(() => Promise.resolve('granted'))
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission })
    const tilt = await load()
    tilt.checkTiltPermission()
    await Promise.resolve()
    await Promise.resolve()
    tilt.requestTiltPermission()
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('never asks with the switch off', async () => {
    const requestPermission = vi.fn(() => Promise.resolve('granted'))
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission })
    const tilt = await load()
    tilt.checkTiltPermission()
    tilt.requestTiltPermission()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('holds the water level with the switch off', async () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {})
    const tilt = await load()
    const seen = []
    const stop = tilt.subscribeTilt((deg) => seen.push(deg))
    const send = () => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 60, gamma: 20 }))
    send()
    tilt.setTiltEnabled(true)
    send()
    stop()
    expect(seen[0]).toBe(0)
    expect(seen[1]).toBeGreaterThan(5)
  })
})
