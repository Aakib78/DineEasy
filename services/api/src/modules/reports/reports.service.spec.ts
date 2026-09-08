import { resolveRange, startOfDay } from './reports.service';

describe('reports date-range resolution', () => {
  describe('startOfDay', () => {
    it('zeroes the time to UTC midnight while keeping the same calendar date', () => {
      const d = new Date('2026-03-14T18:42:07.123Z');
      const result = startOfDay(d);
      expect(result.toISOString()).toBe('2026-03-14T00:00:00.000Z');
    });

    it('is idempotent — applying it twice gives the same result', () => {
      const d = new Date('2026-01-01T00:00:00.000Z');
      expect(startOfDay(startOfDay(d)).toISOString()).toBe(startOfDay(d).toISOString());
    });
  });

  describe('resolveRange', () => {
    it('defaults both from and to to "today" when neither is given', () => {
      const { from, to } = resolveRange({});
      expect(from.toISOString()).toBe(startOfDay(new Date()).toISOString());
      // "to" defaults to now, not end-of-day, so it should be >= "from".
      expect(to.getTime()).toBeGreaterThanOrEqual(from.getTime());
    });

    it('defaults "from" to the start of the given "to" day when only "to" is provided', () => {
      const { from, to } = resolveRange({ to: '2026-06-15T09:30:00.000Z' });
      expect(to.toISOString()).toBe('2026-06-15T09:30:00.000Z');
      expect(from.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    });

    it('defaults "to" to now when only "from" is provided', () => {
      const before = Date.now();
      const { from, to } = resolveRange({ from: '2026-01-01T00:00:00.000Z' });
      const after = Date.now();
      expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(to.getTime()).toBeGreaterThanOrEqual(before);
      expect(to.getTime()).toBeLessThanOrEqual(after);
    });

    it('respects an explicit from/to pair verbatim', () => {
      const { from, to } = resolveRange({
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-02-28T23:59:59.999Z',
      });
      expect(from.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(to.toISOString()).toBe('2026-02-28T23:59:59.999Z');
    });
  });
});
