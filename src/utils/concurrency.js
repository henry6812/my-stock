// Map over items with at most `limit` async calls in flight. Results keep the
// input order; the first rejection rejects the whole call (all-or-nothing,
// like Promise.all).
export const mapWithConcurrency = async (items, limit, fn) => {
  const results = new Array(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index], index)
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}
