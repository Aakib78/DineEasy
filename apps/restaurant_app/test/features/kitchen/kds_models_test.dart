import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/features/kitchen/data/kds_models.dart';

Map<String, dynamic> _ticketJson({
  required List<Map<String, dynamic>> items,
  String? tableName = 'T-4',
}) {
  return {
    'id': 'kot-1',
    'kotNumber': 'KOT-001',
    'isModification': false,
    'createdAt': '2026-09-08T10:00:00.000Z',
    'order': {
      'orderNumber': 'ORD-001',
      'type': 'DINE_IN',
      'tableId': tableName != null ? 'table-1' : null,
      'table': tableName != null ? {'name': tableName} : null,
    },
    'items': items,
  };
}

Map<String, dynamic> _itemJson({
  String id = 'item-1',
  int quantity = 1,
  String status = 'NEW',
  List<Map<String, dynamic>> modifiers = const [],
}) {
  return {
    'id': id,
    'quantity': quantity,
    'status': status,
    'orderItem': {
      'nameSnapshot': 'Paneer Tikka',
      'variantNameSnapshot': null,
      'notes': null,
      'modifiers': modifiers,
    },
  };
}

void main() {
  group('KdsTicket.fromJson', () {
    test('parses a dine-in ticket with its table name', () {
      final ticket = KdsTicket.fromJson(_ticketJson(items: [_itemJson()]));

      expect(ticket.kotNumber, 'KOT-001');
      expect(ticket.orderNumber, 'ORD-001');
      expect(ticket.tableName, 'T-4');
      expect(ticket.isModification, isFalse);
      expect(ticket.items, hasLength(1));
      expect(ticket.createdAt, DateTime.parse('2026-09-08T10:00:00.000Z'));
    });

    test('a takeaway ticket has a null table name', () {
      final ticket = KdsTicket.fromJson(_ticketJson(items: [_itemJson()], tableName: null));

      expect(ticket.tableName, isNull);
    });

    test('parses nested order-item fields and modifiers onto the flattened KdsTicketItem', () {
      final ticket = KdsTicket.fromJson(
        _ticketJson(
          items: [
            _itemJson(
              modifiers: [
                {'nameSnapshot': 'Extra spicy', 'priceDeltaSnapshot': '0.00'},
              ],
            ),
          ],
        ),
      );

      final item = ticket.items.single;
      expect(item.nameSnapshot, 'Paneer Tikka');
      expect(item.modifiers, hasLength(1));
      expect(item.modifiers.single.nameSnapshot, 'Extra spicy');
    });
  });

  group('KdsTicket.hasActiveItems', () {
    test('true when at least one item is still NEW/PREPARING/READY', () {
      final ticket = KdsTicket.fromJson(
        _ticketJson(
          items: [_itemJson(id: 'a', status: 'COMPLETED'), _itemJson(id: 'b', status: 'PREPARING')],
        ),
      );

      expect(ticket.hasActiveItems, isTrue);
    });

    test('false once every item is COMPLETED or CANCELLED — mirrors the backend queue filter', () {
      final ticket = KdsTicket.fromJson(
        _ticketJson(
          items: [_itemJson(id: 'a', status: 'COMPLETED'), _itemJson(id: 'b', status: 'CANCELLED')],
        ),
      );

      expect(ticket.hasActiveItems, isFalse);
    });

    test('false for a ticket with zero items (defensive — should not happen in practice)', () {
      final ticket = KdsTicket.fromJson(_ticketJson(items: []));

      expect(ticket.hasActiveItems, isFalse);
    });
  });

  group('kitchenItemStatusToJson', () {
    test('round-trips every non-NEW status to its wire string', () {
      expect(kitchenItemStatusToJson(KitchenItemStatus.preparing), 'PREPARING');
      expect(kitchenItemStatusToJson(KitchenItemStatus.ready), 'READY');
      expect(kitchenItemStatusToJson(KitchenItemStatus.completed), 'COMPLETED');
      expect(kitchenItemStatusToJson(KitchenItemStatus.cancelled), 'CANCELLED');
    });

    test('rejects NEW as a target status, matching assertKitchenItemTransition on the backend', () {
      expect(() => kitchenItemStatusToJson(KitchenItemStatus.newItem), throwsArgumentError);
    });
  });
}
