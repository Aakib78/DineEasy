import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'staff_models.dart';

class StaffRepository {
  StaffRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<StaffMember>> listStaff() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/staff');
      return (response.data ?? const [])
          .map((s) => StaffMember.fromJson(s as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `roleName` must match an existing `Role.name` for this organization (case-sensitive,
  /// validated server-side against the org's role list — not the fixed permission catalog
  /// itself). `outletId` omitted means an org-wide assignment.
  Future<void> createStaff({
    required String name,
    required String email,
    required String password,
    String? phone,
    required String roleName,
    String? outletId,
  }) async {
    try {
      await _apiClient.dio.post<void>(
        '/staff',
        data: {
          'name': name,
          'email': email,
          'password': password,
          if (phone != null && phone.isNotEmpty) 'phone': phone,
          'roleName': roleName,
          if (outletId != null) 'outletId': outletId,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Every field is independently optional, matching `UpdateStaffDto`'s all-optional shape — a
  /// caller only sends what actually changed. `roleName`/`outletId` are a pair: passing
  /// `roleName` **replaces the role assignment for that specific `outletId` only** (deletes any
  /// existing `UserRole` row matching `(userId, outletId)`, then creates a new one) — it does
  /// **not** touch a role assignment the user already holds at a *different* outlet. A staff
  /// member reassigned from "Manager @ Outlet A" to "Cashier @ Outlet B" (a different
  /// `outletId`) ends up holding **both** roles, not just the new one — see
  /// `UsersService.update` on the backend. Passing `roleName` with `outletId` omitted assigns
  /// (or replaces) the org-wide role.
  Future<void> updateStaff(
    String staffId, {
    String? name,
    String? phone,
    StaffStatus? status,
    String? roleName,
    String? outletId,
  }) async {
    try {
      await _apiClient.dio.patch<void>(
        '/staff/$staffId',
        data: {
          if (name != null) 'name': name,
          if (phone != null) 'phone': phone,
          if (status != null) 'status': staffStatusToJson(status),
          if (roleName != null) 'roleName': roleName,
          if (roleName != null && outletId != null) 'outletId': outletId,
        },
      );
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
