// Wraps an async task so overlapping calls don't stack up: a call made while
// the task is running is folded into a single trailing run, so the last call
// still sees fresh state but a burst of N calls costs at most two runs.
export const coalesceAsync = (task) => {
  let running = null
  let rerun = false

  const run = async () => {
    if (running) {
      rerun = true
      return running
    }
    running = (async () => {
      try {
        do {
          rerun = false
          await task()
        } while (rerun)
      } finally {
        running = null
      }
    })()
    return running
  }

  return run
}
