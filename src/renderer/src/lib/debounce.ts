/**
 * Debounce with leading + trailing execution.
 * First call fires immediately, subsequent calls within the interval
 * are batched and fire once when the timer expires.
 */
export function debouncedLeadingTrailing(fn: () => Promise<void>, ms = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer === null) {
      fn()
    } else {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      fn()
    }, ms)
  }
}
