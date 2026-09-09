import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'organization_models.dart';

class OrganizationRepository {
  OrganizationRepository(this._apiClient);

  final ApiClient _apiClient;

  /// `GET /organizations/me` — no permission gate on the backend (any signed-in user can read
  /// their own org's business info), unlike `updateMine` below.
  Future<Organization> getMine() async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>('/organizations/me');
      return Organization.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `PATCH /organizations/me` — `settings.manage`-gated server-side (Owner only among the
  /// system roles; see `permissions.catalog.ts`'s role table). Every field is optional/additive
  /// — omitted fields are left untouched, so callers only need to send what changed.
  Future<Organization> updateMine({
    String? name,
    String? legalName,
    String? gstin,
    String? phone,
    String? email,
    String? addressLine1,
    String? addressLine2,
    String? city,
    String? state,
    String? pincode,
  }) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/organizations/me',
        data: {
          if (name != null) 'name': name,
          if (legalName != null) 'legalName': legalName,
          if (gstin != null) 'gstin': gstin,
          if (phone != null) 'phone': phone,
          if (email != null) 'email': email,
          if (addressLine1 != null) 'addressLine1': addressLine1,
          if (addressLine2 != null) 'addressLine2': addressLine2,
          if (city != null) 'city': city,
          if (state != null) 'state': state,
          if (pincode != null) 'pincode': pincode,
        },
      );
      return Organization.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
