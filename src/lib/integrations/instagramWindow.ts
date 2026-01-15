export const INSTAGRAM_MESSAGE_WINDOW_HOURS = 24

export function isWithinInstagramWindow(
  lastInboundAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastInboundAt) return false
  const last = typeof lastInboundAt === 'string' ? new Date(lastInboundAt) : lastInboundAt
  if (Number.isNaN(last.getTime())) return false
  const diffMs = now.getTime() - last.getTime()
  return diffMs <= INSTAGRAM_MESSAGE_WINDOW_HOURS * 60 * 60 * 1000
}
