import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money/money.dart';
import '../data/pos_cart_line.dart';

/// In-memory cart for whichever order the staff member is currently building (a new dine-in/
/// takeaway order, or items being added to an already-placed one — see OrderBuilderScreen).
/// Purely a staging area: nothing here is authoritative. `OrdersService` on the backend
/// recomputes every price at the moment `POST /orders` or `POST /orders/:id/items` actually
/// runs, exactly as for the QR customer app (see apps/customer_web's price-estimate.ts for the
/// same philosophy stated on that side).
class PosCartNotifier extends StateNotifier<List<PosCartLine>> {
  PosCartNotifier() : super(const []);

  void addLine(PosCartLine line) {
    state = [...state, line];
  }

  void removeLine(String lineId) {
    state = state.where((l) => l.lineId != lineId).toList();
  }

  void setQuantity(String lineId, int quantity) {
    if (quantity <= 0) {
      removeLine(lineId);
      return;
    }
    state = [
      for (final line in state)
        if (line.lineId == lineId) line.copyWith(quantity: quantity) else line,
    ];
  }

  void clear() {
    state = const [];
  }

  Money get estimatedSubtotal {
    var total = Money.zero;
    for (final line in state) {
      var lineUnit = Money.parse(line.unitPrice);
      for (final modifier in line.modifierSummaries) {
        lineUnit = lineUnit + Money.parse(modifier.priceDelta);
      }
      total = total + lineUnit.times(line.quantity);
    }
    return total;
  }

  int get itemCount => state.fold(0, (sum, line) => sum + line.quantity);
}

/// `autoDispose` so leaving the order-builder flow (back to the table grid) always starts the
/// next order with an empty cart — a leftover cart from a previous table would be a serious
/// (if rare, since staff physically watch the screen) correctness hazard, not just a UX nit.
final posCartProvider = StateNotifierProvider.autoDispose<PosCartNotifier, List<PosCartLine>>(
  (ref) => PosCartNotifier(),
);
