import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../pos/data/pos_models.dart' show PaymentSummary, Refund;

/// `payments.refund`-gated (Owner/Manager only — same permission covers both steps below, so
/// there's no separate "approver" role to design a handoff for in v1). Mirrors
/// `apps/pos_web/src/lib/api/pos.ts`'s `paymentsApi`. See `billing_detail_screen.dart`'s
/// `_RefundCard` for the UI this backs.
class PaymentsRepository {
  PaymentsRepository(this._apiClient);

  final ApiClient _apiClient;

  /// `GET /orders/:orderId/payments` — the only endpoint that returns each payment's `refunds`
  /// array; `Order.payments` (from `GET /orders/:id`) does not include it — see
  /// `PaymentSummary`'s doc comment in `pos_models.dart`.
  Future<List<PaymentSummary>> listForOrder(String orderId) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/orders/$orderId/payments');
      return (response.data ?? const [])
          .map((p) => PaymentSummary.fromJson(p as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Creates a `PENDING` `Refund` row for a partial or full amount of the given payment. Must be
  /// followed by [approveRefund] to actually take effect — see that method's doc comment for why
  /// this app calls both back-to-back rather than exposing a separate "pending refunds" queue.
  Future<Refund> initiateRefund(String paymentId, {required String amount, String? reason}) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/payments/$paymentId/refund',
        data: {'amount': double.parse(amount), if (reason != null && reason.isNotEmpty) 'reason': reason},
      );
      return Refund.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Moves a refund `PENDING` -> `PROCESSED`, immediately applying it. v1 requires the same
  /// `payments.refund` permission for both [initiateRefund] and this call, and has no "reject"
  /// endpoint, so this app always calls them as one user action rather than a two-person
  /// initiate/approve workflow. **Approving any refund — even a small partial one — on a payment
  /// belonging to a PAID/COMPLETED order flips the whole order's status to REFUNDED**, one-way,
  /// no way back (`PaymentsService.approveRefund`'s doc comment on the backend) — the UI warns
  /// about this before calling here, see `billing_detail_screen.dart`.
  Future<Refund> approveRefund(String refundId) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>('/payments/refunds/$refundId/approve');
      return Refund.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
