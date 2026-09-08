import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/features/reports/data/reports_models.dart';

void main() {
  group('SalesSummary.fromJson', () {
    test('parses counts and money fields', () {
      final summary = SalesSummary.fromJson({
        'from': '2026-09-08T00:00:00.000Z',
        'to': '2026-09-08T12:00:00.000Z',
        'orderCount': 12,
        'dineInCount': 9,
        'takeawayCount': 3,
        'subtotal': '10000.00',
        'discountTotal': '500.00',
        'taxTotal': '475.00',
        'serviceChargeTotal': '250.00',
        'revenue': '10225.00',
        'averageOrderValue': '852.08',
      });

      expect(summary.orderCount, 12);
      expect(summary.dineInCount, 9);
      expect(summary.takeawayCount, 3);
      expect(summary.revenue, '10225.00');
      expect(summary.from.isUtc, isTrue);
    });

    test('defaults missing money fields to zero rather than throwing', () {
      final summary = SalesSummary.fromJson({
        'from': '2026-09-08T00:00:00.000Z',
        'to': '2026-09-08T12:00:00.000Z',
        'orderCount': 0,
        'dineInCount': 0,
        'takeawayCount': 0,
      });

      expect(summary.subtotal, '0');
      expect(summary.discountTotal, '0');
      expect(summary.taxTotal, '0');
      expect(summary.serviceChargeTotal, '0');
      expect(summary.revenue, '0');
      expect(summary.averageOrderValue, '0');
    });
  });

  group('TopItem.fromJson', () {
    test('parses a sold-item row', () {
      final item = TopItem.fromJson({
        'menuItemId': 'mi-1',
        'name': 'Paneer Tikka',
        'quantitySold': 42,
        'revenue': '6300.00',
      });

      expect(item.menuItemId, 'mi-1');
      expect(item.name, 'Paneer Tikka');
      expect(item.quantitySold, 42);
      expect(item.revenue, '6300.00');
    });
  });

  group('PaymentBreakdownLine.fromJson', () {
    test('parses a payment-method aggregate row', () {
      final line = PaymentBreakdownLine.fromJson({
        'method': 'UPI',
        'count': 30,
        'amount': '15000.00',
      });

      expect(line.method, 'UPI');
      expect(line.count, 30);
      expect(line.amount, '15000.00');
    });

    test('defaults amount to zero when omitted', () {
      final line = PaymentBreakdownLine.fromJson({'method': 'CASH', 'count': 0});

      expect(line.amount, '0');
    });
  });
}
