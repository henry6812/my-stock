import { describe, it, expect, vi } from 'vitest'
import { coalesceAsync } from './coalesce'

const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('coalesceAsync', () => {
  it('runs immediately when idle', async () => {
    const task = vi.fn().mockResolvedValue(undefined)
    const run = coalesceAsync(task)
    await run()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('folds calls made while running into one trailing run', async () => {
    const first = deferred()
    const task = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined)
    const run = coalesceAsync(task)

    const pending = run()
    run()
    run()
    run()
    first.resolve()
    await pending

    expect(task).toHaveBeenCalledTimes(2)
  })

  it('keeps running after a failed run', async () => {
    const task = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined)
    const run = coalesceAsync(task)

    await expect(run()).rejects.toThrow('boom')
    await run()

    expect(task).toHaveBeenCalledTimes(2)
  })
})
