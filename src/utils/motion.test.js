import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion } from './motion'

describe('prefersReducedMotion', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reflects the media query', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query.includes('reduce') }))
    expect(prefersReducedMotion()).toBe(true)
  })

  it('is false when matchMedia throws', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => {
      throw new Error('nope')
    })
    expect(prefersReducedMotion()).toBe(false)
  })
})
