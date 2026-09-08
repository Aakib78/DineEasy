import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/features/notifications/data/notification_models.dart';

void main() {
  group('AppNotification.fromJson', () {
    test('parses a fully-populated targeted notification', () {
      final notification = AppNotification.fromJson({
        'id': 'notif-1',
        'type': 'ORDER_READY',
        'title': 'Order ready to serve',
        'body': "Table 5's order (#O-104) is ready.",
        'entityType': 'Order',
        'entityId': 'order-104',
        'readAt': null,
        'createdAt': '2026-09-08T12:00:00.000Z',
      });

      expect(notification.id, 'notif-1');
      expect(notification.type, 'ORDER_READY');
      expect(notification.title, 'Order ready to serve');
      expect(notification.entityType, 'Order');
      expect(notification.entityId, 'order-104');
      expect(notification.readAt, isNull);
      expect(notification.isUnread, isTrue);
    });

    test('a non-null readAt makes isUnread false', () {
      final notification = AppNotification.fromJson({
        'id': 'notif-2',
        'type': 'ORDER_READY',
        'title': 'Order ready to serve',
        'body': 'Takeaway order #O-105 is ready.',
        'readAt': '2026-09-08T12:05:00.000Z',
        'createdAt': '2026-09-08T12:00:00.000Z',
      });

      expect(notification.isUnread, isFalse);
      expect(notification.readAt, DateTime.parse('2026-09-08T12:05:00.000Z'));
    });

    test('defaults entityType/entityId to null rather than throwing when absent', () {
      final notification = AppNotification.fromJson({
        'id': 'notif-3',
        'type': 'ORDER_READY',
        'title': 'Order ready to serve',
        'body': 'Some order is ready.',
        'createdAt': '2026-09-08T12:00:00.000Z',
      });

      expect(notification.entityType, isNull);
      expect(notification.entityId, isNull);
    });

    test('falls back to an empty type/title/body rather than throwing on an unrecognized shape', () {
      final notification = AppNotification.fromJson({
        'id': 'notif-4',
        'createdAt': '2026-09-08T12:00:00.000Z',
      });

      expect(notification.type, '');
      expect(notification.title, '');
      expect(notification.body, '');
      // A future second notification type never seen before still parses cleanly (see the
      // class doc comment on why `type` is a raw string, not an enum with a fallback branch).
    });
  });
}
