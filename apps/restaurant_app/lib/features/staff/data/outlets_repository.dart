import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'staff_models.dart';

class OutletsRepository {
  OutletsRepository(this._apiClient);

  final ApiClient _apiClient;

  /// `GET /outlets` has no `@RequirePermission` on the backend (`OutletsController.list`) —
  /// only `JwtAuthGuard`, i.e. any signed-in staff member of the organization can list its
  /// outlets. Used here purely to populate the outlet-assignment dropdown when creating or
  /// editing a staff member's role.
  Future<List<StaffOutlet>> listOutlets() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/outlets');
      return (response.data ?? const [])
          .map((o) => StaffOutlet.fromJson(o as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
