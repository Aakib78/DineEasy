/** Parses a short duration string ("15m", "30d", "12h", "45s") into milliseconds. */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${duration}" (expected e.g. "15m", "30d")`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * unitMs[unit];
}
