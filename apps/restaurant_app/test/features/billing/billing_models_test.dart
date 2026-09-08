import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/features/billing/data/billing_models.dart';

void main() {
  group('Invoice.fromJson', () {
    test('parses totals, items, and tax lines', () {
      final invoice = Invoice.fromJson({
        'id': 'inv-1',
        'invoiceNumber': 'INV-001',
        'subtotal': '500.00',
        'discountTotal': '0',
        'taxTotal': '25.00',
        'serviceChargeTotal': '0',
        'total': '525.00',
        'items': [
          {
            'description': 'Paneer Tikka (Full)',
            'quantity': 2,
            'unitPrice': '150.00',
            'subtotal': '300.00',
            'taxAmount': '15.00',
            'total': '315.00',
          },
        ],
        'taxes': [
          {'taxType': 'CGST', 'ratePercent': '2.50', 'taxableAmount': '500.00', 'taxAmount': '12.50'},
          {'taxType': 'SGST', 'ratePercent': '2.50', 'taxableAmount': '500.00', 'taxAmount': '12.50'},
        ],
      });

      expect(invoice.invoiceNumber, 'INV-001');
      expect(invoice.total, '525.00');
      expect(invoice.items, hasLength(1));
      expect(invoice.items.single.description, 'Paneer Tikka (Full)');
      expect(invoice.taxes, hasLength(2));
      expect(invoice.taxes.first.taxType, 'CGST');
    });

    test('defaults discount/tax/service-charge totals to zero when the backend omits them', () {
      final invoice = Invoice.fromJson({
        'id': 'inv-2',
        'invoiceNumber': 'INV-002',
        'subtotal': '100.00',
        'total': '100.00',
        'items': [],
        'taxes': [],
      });

      expect(invoice.discountTotal, '0');
      expect(invoice.taxTotal, '0');
      expect(invoice.serviceChargeTotal, '0');
    });

    test('handles a taxTotal of zero for a no-tax-configured item without throwing', () {
      final invoice = Invoice.fromJson({
        'id': 'inv-3',
        'invoiceNumber': 'INV-003',
        'subtotal': '100.00',
        'total': '100.00',
        'items': const [],
        'taxes': const [],
      });

      expect(invoice.taxes, isEmpty);
    });
  });
}
