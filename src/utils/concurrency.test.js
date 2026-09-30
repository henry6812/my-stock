import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from './concurrency'

const tick = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

describe('mapWithConcurrency', () => {
  it('returns results in input order even when tasks finish out of order', async () => {
    const result = await mapWithConcurrency([30, 5, 15, 1], 2, async (ms) => {
      await tick(ms)
      return ms * 10
    })
    expect(result).toEqual([300, 50, 150, 10])
  })

  it('never runs more than `limit` tasks at once', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active += 1
      peak = Math.max(peak, active)
      await tick(2)
      active -= 1
    })
    expect(peak).toBe(3)
  })

  it('rejects when any task fails', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      }),
    ).rejects.toThrow('boom')
  })

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async (x) => x)).toEqual([])
  })
})
