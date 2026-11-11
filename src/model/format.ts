/** Display formatting for blocks and the inspector (pure). */

/** Compact age: `now`, `5m`, `3h`, `2d`, `3w`, `4mo`, `2y`. */
export function shortAge(epochSeconds: null | number | undefined, nowMs: number = Date.now()): string {
  if (!epochSeconds) {
    return '—'
  }

  const seconds = Math.max(0, nowMs / 1000 - epochSeconds)

  if (seconds < 60) {
    return 'now'
  }

  const minutes = seconds / 60

  if (minutes < 60) {
    return `${Math.floor(minutes)}m`
  }

  const hours = minutes / 60

  if (hours < 24) {
    return `${Math.floor(hours)}h`
  }

  const days = hours / 24

  if (days < 14) {
    return `${Math.floor(days)}d`
  }

  if (days < 60) {
    return `${Math.floor(days / 7)}w`
  }

  if (days < 365) {
    return `${Math.floor(days / 30)}mo`
  }

  return `${Math.floor(days / 365)}y`
}

/** `3h ago` / `now`. */
export function agoLabel(epochSeconds: null | number | undefined, nowMs: number = Date.now()): string {
  const age = shortAge(epochSeconds, nowMs)

  return age === 'now' || age === '—' ? age : `${age} ago`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Nov 6, 14:02` in local time. */
export function dateTimeLabel(epochSeconds: null | number | undefined): string {
  if (!epochSeconds) {
    return '—'
  }

  const date = new Date(epochSeconds * 1000)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')

  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${hh}:${mm}`
}

/** `412`, `12.0k`, `1.40M`. */
export function compactNumber(value: null | number | undefined): string {
  const n = Number(value ?? 0)

  if (!Number.isFinite(n)) {
    return '—'
  }

  if (Math.abs(n) >= 1e6) {
    return `${(n / 1e6).toFixed(2)}M`
  }

  if (Math.abs(n) >= 1e3) {
    return `${(n / 1e3).toFixed(1)}k`
  }

  return String(Math.round(n))
}

/** `$0.12`; `—` when unknown. */
export function costLabel(actual: null | number | undefined, estimated: null | number | undefined): string {
  const value = typeof actual === 'number' && actual > 0 ? actual : estimated

  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '—'
}
