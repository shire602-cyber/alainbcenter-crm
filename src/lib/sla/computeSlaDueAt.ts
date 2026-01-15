import { toZonedTime, fromZonedTime } from 'date-fns-tz'

type BusinessHoursWindow = { start: number; end: number } | null

const DUBAI_TZ = 'Asia/Dubai'

const BUSINESS_HOURS_BY_DAY: Record<number, BusinessHoursWindow> = {
  0: null, // Sun
  1: { start: 9, end: 20 }, // Mon
  2: { start: 9, end: 20 }, // Tue
  3: { start: 9, end: 20 }, // Wed
  4: { start: 9, end: 20 }, // Thu
  5: { start: 9, end: 20 }, // Fri
  6: { start: 10, end: 17 }, // Sat
}

function getBusinessWindow(dateInTz: Date): { start: Date; end: Date } | null {
  const day = dateInTz.getDay()
  const window = BUSINESS_HOURS_BY_DAY[day]
  if (!window) return null

  const start = new Date(dateInTz)
  start.setHours(window.start, 0, 0, 0)
  const end = new Date(dateInTz)
  end.setHours(window.end, 0, 0, 0)

  return { start, end }
}

function nextBusinessStart(dateInTz: Date): Date {
  let cursor = new Date(dateInTz)
  cursor.setDate(cursor.getDate() + 1)
  cursor.setHours(0, 0, 0, 0)

  while (true) {
    const window = getBusinessWindow(cursor)
    if (window) {
      return window.start
    }
    cursor.setDate(cursor.getDate() + 1)
  }
}

export function computeSlaDueAt(
  receivedAt: Date,
  slaHours: number,
  timezone: string = DUBAI_TZ
): Date {
  let remainingMinutes = Math.max(0, Math.round(slaHours * 60))
  let currentUtc = new Date(receivedAt)

  while (remainingMinutes > 0) {
    const currentTz = toZonedTime(currentUtc, timezone)
    const window = getBusinessWindow(currentTz)

    if (!window) {
      const nextStartTz = nextBusinessStart(currentTz)
      currentUtc = fromZonedTime(nextStartTz, timezone)
      continue
    }

    if (currentTz < window.start) {
      currentUtc = fromZonedTime(window.start, timezone)
      continue
    }

    if (currentTz >= window.end) {
      const nextStartTz = nextBusinessStart(currentTz)
      currentUtc = fromZonedTime(nextStartTz, timezone)
      continue
    }

    const availableMinutes = Math.floor((window.end.getTime() - currentTz.getTime()) / (60 * 1000))
    if (remainingMinutes <= availableMinutes) {
      return new Date(currentUtc.getTime() + remainingMinutes * 60 * 1000)
    }

    remainingMinutes -= availableMinutes
    const nextStartTz = nextBusinessStart(currentTz)
    currentUtc = fromZonedTime(nextStartTz, timezone)
  }

  return currentUtc
}

export function runSlaAssertions(now: Date = new Date()) {
  const base = new Date(now)
  const results: Array<{ name: string; expected: string; actual: string }> = []

  const fri1930 = new Date(base)
  fri1930.setUTCHours(15, 30, 0, 0) // Fri 19:30 Dubai is UTC+4
  results.push({
    name: 'Fri 19:30 +2h -> Sat 10:30',
    expected: 'Sat 10:30',
    actual: formatDubai(computeSlaDueAt(fri1930, 2)),
  })

  const sat1630 = new Date(base)
  sat1630.setUTCHours(12, 30, 0, 0) // Sat 16:30 Dubai is UTC+4
  results.push({
    name: 'Sat 16:30 +2h -> Mon 10:30',
    expected: 'Mon 10:30',
    actual: formatDubai(computeSlaDueAt(sat1630, 2)),
  })

  return results
}

function formatDubai(date: Date): string {
  const d = toZonedTime(date, DUBAI_TZ)
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  const hour = d.getHours().toString().padStart(2, '0')
  const minute = d.getMinutes().toString().padStart(2, '0')
  return `${day} ${hour}:${minute}`
}
