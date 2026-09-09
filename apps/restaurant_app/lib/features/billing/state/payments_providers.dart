import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../../pos/data/pos_models.dart' show PaymentSummary;
import '../data/payments_repository.dart';

final paymentsRepositoryProvider = Provider<PaymentsRepository>(
  (ref) => PaymentsRepository(ref.watch(apiClientProvider)),
);

/// The full payment list for one order, including each payment's `refunds` — see
/// `PaymentsRepository.listForOrder`'s doc comment for why this is fetched separately from
/// `orderByIdProvider` rather than reading `Order.payments`. `billing_detail_screen.dart` watches
/// this instead of `order.payments` for its Payments section and refund UI so refund status is
/// reflected everywhere consistently.
final paymentsForOrderProvider = FutureProvider.autoDispose.family<List<PaymentSummary>, String>((ref, orderId) {
  return ref.watch(paymentsRepositoryProvider).listForOrder(orderId);
});
