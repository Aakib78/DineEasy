import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/features/pos/data/pos_cart_line.dart';
import 'package:dineeasy_staff/features/pos/state/pos_cart.dart';

PosCartLine _line({
  required String id,
  String unitPrice = '100.00',
  int quantity = 1,
  List<({String name, String priceDelta})> modifiers = const [],
}) {
  return PosCartLine(
    lineId: id,
    menuItemId: 'item-$id',
    menuItemName: 'Item $id',
    unitPrice: unitPrice,
    quantity: quantity,
    modifierIds: const [],
    modifierSummaries: modifiers,
  );
}

void main() {
  group('PosCartNotifier', () {
    test('starts empty', () {
      final notifier = PosCartNotifier();
      expect(notifier.state, isEmpty);
      expect(notifier.itemCount, 0);
      expect(notifier.estimatedSubtotal.format(), '₹0.00');
    });

    test('addLine appends without mutating earlier lines', () {
      final notifier = PosCartNotifier();
      notifier.addLine(_line(id: 'a'));
      notifier.addLine(_line(id: 'b'));

      expect(notifier.state.map((l) => l.lineId), ['a', 'b']);
    });

    test('setQuantity updates only the matching line', () {
      final notifier = PosCartNotifier();
      notifier.addLine(_line(id: 'a', quantity: 1));
      notifier.addLine(_line(id: 'b', quantity: 1));

      notifier.setQuantity('a', 3);

      expect(notifier.state.firstWhere((l) => l.lineId == 'a').quantity, 3);
      expect(notifier.state.firstWhere((l) => l.lineId == 'b').quantity, 1);
    });

    test('setQuantity to zero (or below) removes the line, mirroring the UI\'s "-" button at '
        'quantity 1', () {
      final notifier = PosCartNotifier();
      notifier.addLine(_line(id: 'a'));

      notifier.setQuantity('a', 0);

      expect(notifier.state, isEmpty);
    });

    test('removeLine drops only the targeted line', () {
      final notifier = PosCartNotifier();
      notifier.addLine(_line(id: 'a'));
      notifier.addLine(_line(id: 'b'));

      notifier.removeLine('a');

      expect(notifier.state.map((l) => l.lineId), ['b']);
    });

    test('clear empties the cart', () {
      final notifier = PosCartNotifier();
      notifier.addLine(_line(id: 'a'));
      notifier.addLine(_line(id: 'b'));

      notifier.clear();

      expect(notifier.state, isEmpty);
    });

    test('estimatedSubtotal sums unit price + modifier deltas, times quantity, across lines', () {
      final notifier = PosCartNotifier();
      notifier.addLine(
        _line(
          id: 'a',
          unitPrice: '150.00',
          quantity: 2,
          modifiers: const [(name: 'Extra cheese', priceDelta: '20.00')],
        ),
      );
      notifier.addLine(_line(id: 'b', unitPrice: '99.50', quantity: 1));

      // a: (150.00 + 20.00) * 2 = 340.00 ; b: 99.50 ; total = 439.50
      expect(notifier.estimatedSubtotal.format(), '₹439.50');
    });

    test('itemCount sums quantities, not line count', () {
      final notifier = PosCartNotifier();
      notifier.addLine(_line(id: 'a', quantity: 3));
      notifier.addLine(_line(id: 'b', quantity: 2));

      expect(notifier.itemCount, 5);
    });
  });

  group('nextCartLineId', () {
    test('never returns the same id twice, even called back-to-back', () {
      final ids = {for (var i = 0; i < 50; i++) nextCartLineId()};
      expect(ids, hasLength(50));
    });
  });
}
