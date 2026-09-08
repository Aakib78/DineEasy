import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/billing_models.dart';
import '../data/billing_repository.dart';

final billingRepositoryProvider = Provider<BillingRepository>(
  (ref) => BillingRepository(ref.watch(apiClientProvider)),
);

/// The invoice for one order, once it has one (order status BILLED or later). Kept separate
/// from `orderByIdProvider` (`lib/features/pos/state/pos_providers.dart`) rather than folded
/// into the `Order` model itself — an invoice is its own immutable record with its own GST
/// breakdown (`InvoiceTaxLine`), not just another view of the order's rolled-up totals.
final invoiceForOrderProvider = FutureProvider.autoDispose.family<Invoice, String>((ref, orderId) {
  return ref.watch(billingRepositoryProvider).getInvoiceByOrder(orderId);
});
