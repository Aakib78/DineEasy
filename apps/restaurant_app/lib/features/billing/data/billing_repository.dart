import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../pos/data/pos_models.dart' show PaymentMethod, paymentMethodToJson;
import 'billing_models.dart';

class BillingRepository {
  BillingRepository(this._apiClient);

  final ApiClient _apiClient;

  /// Idempotent on the backend (`BillingService.generateInvoice` returns the existing invoice
  /// if one already exists for this order rather than erroring) — safe to call again if a
  /// staff member double-taps "Generate bill" or retries after a dropped connection.
  Future<Invoice> generateInvoice(String orderId) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>('/orders/$orderId/invoice');
      return Invoice.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<Invoice> getInvoiceByOrder(String orderId) async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>('/orders/$orderId/invoice');
      return Invoice.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// A partial payment (e.g. one guest paying cash for their share) is legal — the order only
  /// advances past BILLED once the running total of SUCCEEDED payments covers the full amount
  /// (`PaymentsService.recordPayment`'s doc comment). The response body isn't parsed into a
  /// model here: callers re-fetch the order (`orderByIdProvider`) afterward to get its current
  /// status and payment list in one consistent read, rather than trying to merge this response
  /// into local state by hand.
  Future<void> recordPayment(String orderId, {required PaymentMethod method, required String amount}) async {
    try {
      await _apiClient.dio.post<void>(
        '/orders/$orderId/payments',
        data: {'method': paymentMethodToJson(method), 'amount': double.parse(amount)},
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
