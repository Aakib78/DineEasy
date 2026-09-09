import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'audit_models.dart';

class AuditRepository {
  AuditRepository(this._apiClient);

  final ApiClient _apiClient;

  /// `GET /audit-logs` — org-wide (not outlet-scoped: `AuditLog.organizationId` is the only
  /// filter `AuditLogService.listForOrganization` applies), newest first, no `entityType`/actor
  /// filter on the backend yet. Defaults to the server's own default (100) when omitted; capped
  /// at 500 server-side regardless of what's asked for.
  Future<List<AuditLogEntry>> list({int? limit}) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>(
        '/audit-logs',
        queryParameters: {if (limit != null) 'limit': limit},
      );
      return (response.data ?? const [])
          .map((e) => AuditLogEntry.fromJson(e as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
