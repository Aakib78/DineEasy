import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'reports_models.dart';

class ReportsRepository {
  ReportsRepository(this._apiClient);

  final ApiClient _apiClient;

  /// `from`/`to` are ISO 8601 strings, both optional — `ReportRangeDto` on the backend resolves
  /// a missing `to` to "now" and a missing `from` to the start of `to`'s day
  /// (`ReportsService.resolveRange`/`startOfDay`). Passing `null` for either simply omits that
  /// query param rather than sending an empty string, so the backend's own defaulting applies.
  Future<SalesSummary> getSalesSummary({DateTime? from, DateTime? to}) async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>(
        '/reports/sales-summary',
        queryParameters: _rangeParams(from, to),
      );
      return SalesSummary.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<List<TopItem>> getTopItems({DateTime? from, DateTime? to}) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>(
        '/reports/top-items',
        queryParameters: _rangeParams(from, to),
      );
      return (response.data ?? const [])
          .map((i) => TopItem.fromJson(i as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<List<PaymentBreakdownLine>> getPaymentBreakdown({DateTime? from, DateTime? to}) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>(
        '/reports/payment-breakdown',
        queryParameters: _rangeParams(from, to),
      );
      return (response.data ?? const [])
          .map((p) => PaymentBreakdownLine.fromJson(p as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Map<String, dynamic>? _rangeParams(DateTime? from, DateTime? to) {
    final params = <String, dynamic>{
      if (from != null) 'from': from.toUtc().toIso8601String(),
      if (to != null) 'to': to.toUtc().toIso8601String(),
    };
    return params.isEmpty ? null : params;
  }
}
