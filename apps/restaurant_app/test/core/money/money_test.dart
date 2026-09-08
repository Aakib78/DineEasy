import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/core/money/money.dart';

void main() {
  group('Money.parse + format', () {
    test('formats a whole-rupee amount', () {
      expect(Money.parse('245').format(), '₹245.00');
    });

    test('formats an amount with two decimal places', () {
      expect(Money.parse('245.50').format(), '₹245.50');
    });

    test('formats an amount with one decimal place by right-padding', () {
      expect(Money.parse('99.5').format(), '₹99.50');
    });

    test('truncates extra precision rather than rounding (server is authoritative anyway)', () {
      expect(Money.parse('10.999').format(), '₹10.99');
    });

    test('handles a negative amount', () {
      expect(Money.parse('-50.25').format(), '-₹50.25');
    });

    test('zero formats correctly', () {
      expect(Money.zero.format(), '₹0.00');
    });
  });

  group('Money arithmetic', () {
    test('addition combines two amounts exactly, no float drift', () {
      final sum = Money.parse('10.10') + Money.parse('0.20');
      expect(sum.format(), '₹10.30');
    });

    test('adding many small amounts stays exact (the classic 0.1 + 0.2 float trap)', () {
      var total = Money.zero;
      for (var i = 0; i < 10; i++) {
        total = total + Money.parse('0.10');
      }
      expect(total.format(), '₹1.00');
    });

    test('times multiplies by an integer quantity', () {
      expect(Money.parse('49.50').times(3).format(), '₹148.50');
    });

    test('times by zero yields zero', () {
      expect(Money.parse('99.99').times(0).format(), '₹0.00');
    });
  });
}
