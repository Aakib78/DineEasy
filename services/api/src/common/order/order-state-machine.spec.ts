import {
  assertKitchenItemTransition,
  assertOrderTransition,
  canTransitionOrder,
  KitchenItemStatus,
  OrderStatus,
} from './order-state-machine';
import { InvalidOrderTransitionError } from '../errors/domain-errors';

describe('order state machine', () => {
  describe('canTransitionOrder', () => {
    it('allows the standard happy-path walk from DRAFT to COMPLETED', () => {
      const path: OrderStatus[] = [
        'DRAFT',
        'PLACED',
        'ACCEPTED',
        'PREPARING',
        'READY',
        'SERVED',
        'BILLED',
        'PAID',
        'COMPLETED',
      ];
      for (let i = 0; i < path.length - 1; i++) {
        expect(canTransitionOrder(path[i], path[i + 1])).toBe(true);
      }
    });

    it('allows CANCELLED from every pre-payment state', () => {
      const preePayment: OrderStatus[] = [
        'DRAFT',
        'PLACED',
        'ACCEPTED',
        'PREPARING',
        'READY',
        'SERVED',
        'BILLED',
      ];
      for (const from of preePayment) {
        expect(canTransitionOrder(from, 'CANCELLED')).toBe(true);
      }
    });

    it('refuses CANCELLED once money has changed hands (PAID/COMPLETED)', () => {
      expect(canTransitionOrder('PAID', 'CANCELLED')).toBe(false);
      expect(canTransitionOrder('COMPLETED', 'CANCELLED')).toBe(false);
    });

    it('allows the one documented backward edge: READY -> PREPARING', () => {
      expect(canTransitionOrder('READY', 'PREPARING')).toBe(true);
    });

    it('refuses every other backward or skip-ahead jump', () => {
      expect(canTransitionOrder('PREPARING', 'READY')).toBe(true); // sanity: forward is fine
      expect(canTransitionOrder('PLACED', 'PAID')).toBe(false); // skips billing entirely
      expect(canTransitionOrder('SERVED', 'PLACED')).toBe(false); // backward, not the documented edge
      expect(canTransitionOrder('ACCEPTED', 'PREPARING')).toBe(true);
      expect(canTransitionOrder('ACCEPTED', 'DRAFT')).toBe(false);
    });

    it('treats PAID as a one-way branch to COMPLETED or REFUNDED only', () => {
      expect(canTransitionOrder('PAID', 'COMPLETED')).toBe(true);
      expect(canTransitionOrder('PAID', 'REFUNDED')).toBe(true);
      expect(canTransitionOrder('PAID', 'BILLED')).toBe(false);
    });

    it('treats CANCELLED and REFUNDED as terminal states', () => {
      expect(canTransitionOrder('CANCELLED', 'PLACED')).toBe(false);
      expect(canTransitionOrder('CANCELLED', 'DRAFT')).toBe(false);
      expect(canTransitionOrder('REFUNDED', 'COMPLETED')).toBe(false);
    });
  });

  describe('assertOrderTransition', () => {
    it('does not throw for a legal transition', () => {
      expect(() => assertOrderTransition('PLACED', 'ACCEPTED')).not.toThrow();
    });

    it('throws InvalidOrderTransitionError for an illegal transition', () => {
      expect(() => assertOrderTransition('DRAFT', 'SERVED')).toThrow(InvalidOrderTransitionError);
    });

    it('includes the from/to states in the thrown error message', () => {
      try {
        assertOrderTransition('COMPLETED', 'DRAFT');
        fail('expected assertOrderTransition to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidOrderTransitionError);
        expect((err as InvalidOrderTransitionError).message).toContain('COMPLETED');
        expect((err as InvalidOrderTransitionError).message).toContain('DRAFT');
      }
    });
  });

  describe('assertKitchenItemTransition', () => {
    it('walks the happy path NEW -> PREPARING -> READY -> COMPLETED', () => {
      const path: KitchenItemStatus[] = ['NEW', 'PREPARING', 'READY', 'COMPLETED'];
      for (let i = 0; i < path.length - 1; i++) {
        expect(() => assertKitchenItemTransition(path[i], path[i + 1])).not.toThrow();
      }
    });

    it('allows CANCELLED from NEW, PREPARING, and READY', () => {
      expect(() => assertKitchenItemTransition('NEW', 'CANCELLED')).not.toThrow();
      expect(() => assertKitchenItemTransition('PREPARING', 'CANCELLED')).not.toThrow();
      expect(() => assertKitchenItemTransition('READY', 'CANCELLED')).not.toThrow();
    });

    it('refuses to move a COMPLETED or CANCELLED item anywhere', () => {
      expect(() => assertKitchenItemTransition('COMPLETED', 'PREPARING')).toThrow(
        InvalidOrderTransitionError,
      );
      expect(() => assertKitchenItemTransition('CANCELLED', 'NEW')).toThrow(
        InvalidOrderTransitionError,
      );
    });

    it('refuses skipping straight from NEW to READY or COMPLETED', () => {
      expect(() => assertKitchenItemTransition('NEW', 'READY')).toThrow(
        InvalidOrderTransitionError,
      );
      expect(() => assertKitchenItemTransition('NEW', 'COMPLETED')).toThrow(
        InvalidOrderTransitionError,
      );
    });
  });
});
