import { parseDurationToMs } from './duration.util';

describe('parseDurationToMs', () => {
  it('parses seconds', () => {
    expect(parseDurationToMs('45s')).toBe(45_000);
  });

  it('parses minutes', () => {
    expect(parseDurationToMs('15m')).toBe(15 * 60_000);
  });

  it('parses hours', () => {
    expect(parseDurationToMs('12h')).toBe(12 * 3_600_000);
  });

  it('parses days', () => {
    expect(parseDurationToMs('30d')).toBe(30 * 86_400_000);
  });

  it('parses milliseconds', () => {
    expect(parseDurationToMs('500ms')).toBe(500);
  });

  it('throws on an invalid string', () => {
    expect(() => parseDurationToMs('banana')).toThrow(/Invalid duration string/);
  });

  it('throws on a missing unit', () => {
    expect(() => parseDurationToMs('30')).toThrow(/Invalid duration string/);
  });
});
