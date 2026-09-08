/// Extremely small fixed-point decimal helper for money display. The API always sends money
/// as decimal *strings* (see docs/database.md's "never a float" rule on the backend) — this
/// class exists so nothing in the app ever round-trips a price through `double`, which would
/// reintroduce the exact class of rounding bug the backend goes out of its way to avoid.
/// Deliberately minimal (integer paise arithmetic) rather than a full decimal library — the app
/// only ever adds/multiplies-by-int-quantity money values for *display estimates*; the server
/// is always the authority on the real total (see PosCart's doc comment).
class Money implements Comparable<Money> {
  const Money._(this._paise);

  factory Money.parse(String decimalString) {
    final trimmed = decimalString.trim();
    final negative = trimmed.startsWith('-');
    final unsigned = negative ? trimmed.substring(1) : trimmed;
    final parts = unsigned.split('.');
    final wholePart = parts[0].isEmpty ? '0' : parts[0];
    final fractionPart = (parts.length > 1 ? parts[1] : '').padRight(2, '0').substring(0, 2);
    final paise = int.parse(wholePart) * 100 + int.parse(fractionPart);
    return Money._(negative ? -paise : paise);
  }

  static const zero = Money._(0);

  final int _paise;

  Money operator +(Money other) => Money._(_paise + other._paise);

  Money times(int quantity) => Money._(_paise * quantity);

  @override
  int compareTo(Money other) => _paise.compareTo(other._paise);

  bool operator <(Money other) => _paise < other._paise;
  bool operator <=(Money other) => _paise <= other._paise;
  bool operator >(Money other) => _paise > other._paise;
  bool operator >=(Money other) => _paise >= other._paise;

  @override
  bool operator ==(Object other) => other is Money && other._paise == _paise;

  @override
  int get hashCode => _paise.hashCode;

  /// ₹-formatted for display, e.g. "₹245.00". Not locale-aware beyond the fixed ₹ symbol —
  /// v1 is India-only (spec §1), so this matches docs/architecture.md's scope rather than
  /// under-building for a locale nobody's asked for yet.
  String format() {
    final sign = _paise < 0 ? '-' : '';
    final absPaise = _paise.abs();
    final whole = absPaise ~/ 100;
    final fraction = (absPaise % 100).toString().padLeft(2, '0');
    return '$sign₹$whole.$fraction';
  }
}
