import { deriveKitchenDrivenOrderStatus } from './kitchen-status.util';

describe('deriveKitchenDrivenOrderStatus', () => {
  it('returns null for no items at all', () => {
    expect(deriveKitchenDrivenOrderStatus([])).toBeNull();
  });

  it('every item still NEW: nothing has started, no advance', () => {
    expect(deriveKitchenDrivenOrderStatus(['NEW', 'NEW'])).toBeNull();
  });

  it('one item PREPARING: the ticket has started, advance to PREPARING', () => {
    expect(deriveKitchenDrivenOrderStatus(['NEW', 'PREPARING'])).toBe('PREPARING');
  });

  it('every item READY or COMPLETED: the whole ticket is done, advance to READY', () => {
    expect(deriveKitchenDrivenOrderStatus(['READY', 'COMPLETED'])).toBe('READY');
  });

  it('a mix of READY and still-PREPARING: not fully done yet, stays at PREPARING', () => {
    expect(deriveKitchenDrivenOrderStatus(['READY', 'PREPARING'])).toBe('PREPARING');
  });

  it('CANCELLED items are excluded from the decision entirely', () => {
    // Two items ready, one cancelled -- the cancelled one shouldn't block "all done".
    expect(deriveKitchenDrivenOrderStatus(['READY', 'READY', 'CANCELLED'])).toBe('READY');
  });

  it('every item CANCELLED: nothing relevant left, no advance (not a vacuous "all done")', () => {
    expect(deriveKitchenDrivenOrderStatus(['CANCELLED', 'CANCELLED'])).toBeNull();
  });

  it('a CANCELLED item alongside only NEW items: still nothing started', () => {
    expect(deriveKitchenDrivenOrderStatus(['NEW', 'CANCELLED'])).toBeNull();
  });

  it('a single COMPLETED item on its own: fully done', () => {
    expect(deriveKitchenDrivenOrderStatus(['COMPLETED'])).toBe('READY');
  });
});
