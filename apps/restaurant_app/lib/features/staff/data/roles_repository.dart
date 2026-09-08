import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'staff_models.dart';

class RolesRepository {
  RolesRepository(this._apiClient);

  final ApiClient _apiClient;

  /// The organization's roles (5 seeded system roles plus any custom ones) — used to populate
  /// the role-assignment dropdown when creating or editing a staff member. Gated on
  /// `staff.view` server-side (same as every other `/staff`-area read), not `staff.manage`, so
  /// a view-only role can still see role *names* even if the mutating screens are hidden from
  /// them — matches `RolesController.listRoles`'s permission decorator.
  Future<List<StaffRole>> listRoles() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/roles');
      return (response.data ?? const [])
          .map((r) => StaffRole.fromJson(r as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
