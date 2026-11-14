const MAX_TIMER_DELAY_MS = 2 ** 31 - 1

export function abortAfter(ms: number) {
  const controller = new AbortController()
  const delayMs = ms > 0 ? ms : 0

  if (delayMs > MAX_TIMER_DELAY_MS) {
    return { signal: controller.signal, cancel: () => {} }
  }

  const timer = setTimeout(() => controller.abort(new DOMException('Budget exhausted', 'TimeoutError')), delayMs)
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}
