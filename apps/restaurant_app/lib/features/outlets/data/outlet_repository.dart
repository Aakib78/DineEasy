import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'outlet_models.dart';

/// `GET`/`PATCH /outlets/:id` (`OutletsController`) — reading has no permission gate server-side
/// (any signed-in staff member of the organization can view an outlet's own settings), editing
/// is `settings.manage`-gated (Owner only among the system roles), same split as
/// `OrganizationRepository`. Unlike `/organizations/me`, `OutletsController` has no "my active
/// outlet" convenience route — every call here needs an explicit outlet id, which
/// `OutletSettingsScreen` gets from the signed-in user's `activeOutletId` JWT claim (the same
/// claim `requireActiveOutlet()` derives from server-side for every other outlet-scoped route).
class OutletRepository {
  OutletRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<Outlet> getById(String outletId) async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>('/outlets/$outletId');
      return Outlet.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `POST /outlets` (`OutletsController.create`), `settings.manage`-gated. Used by
  /// `CreateOutletScreen` — both for a fresh owner's very first outlet right after
  /// `POST /auth/register` (their token already carries `settings.manage` org-wide, see
  /// `AuthService.register`'s doc comment, so no re-login is needed to call this immediately)
  /// and for an existing Owner/Manager adding an additional outlet to a growing chain. Unlike
  /// [update], `name`/`code` are required here — `code` becomes immutable once set (no field on
  /// `UpdateOutletDto`), and the backend uppercases whatever's sent.
  Future<Outlet> create({
    required String name,
    required String code,
    String? phone,
    String? addressLine1,
    String? addressLine2,
    String? city,
    String? state,
    String? pincode,
    String? gstin,
    String? fssaiLicense,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/outlets',
        data: {
          'name': name,
          'code': code,
          if (phone != null && phone.isNotEmpty) 'phone': phone,
          if (addressLine1 != null && addressLine1.isNotEmpty) 'addressLine1': addressLine1,
          if (addressLine2 != null && addressLine2.isNotEmpty) 'addressLine2': addressLine2,
          if (city != null && city.isNotEmpty) 'city': city,
          if (state != null && state.isNotEmpty) 'state': state,
          if (pincode != null && pincode.isNotEmpty) 'pincode': pincode,
          if (gstin != null && gstin.isNotEmpty) 'gstin': gstin,
          if (fssaiLicense != null && fssaiLicense.isNotEmpty) 'fssaiLicense': fssaiLicense,
        },
      );
      return Outlet.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Every field is optional/additive — omitted fields are left untouched, so callers only need
  /// to send what changed. Unlike `OrganizationRepository.updateMine`, `Outlet` has no
  /// `@IsEmail()`-validated field, so an emptied text field can simply be sent as `''` to clear
  /// it server-side rather than needing the null-to-omit workaround that method's `email`
  /// parameter needs.
  Future<Outlet> update(
    String outletId, {
    String? name,
    String? phone,
    String? addressLine1,
    String? addressLine2,
    String? city,
    String? state,
    String? pincode,
    String? gstin,
    String? fssaiLicense,
    double? serviceChargePercent,
    bool? roundOffEnabled,
  }) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/outlets/$outletId',
        data: {
          if (name != null) 'name': name,
          if (phone != null) 'phone': phone,
          if (addressLine1 != null) 'addressLine1': addressLine1,
          if (addressLine2 != null) 'addressLine2': addressLine2,
          if (city != null) 'city': city,
          if (state != null) 'state': state,
          if (pincode != null) 'pincode': pincode,
          if (gstin != null) 'gstin': gstin,
          if (fssaiLicense != null) 'fssaiLicense': fssaiLicense,
          if (serviceChargePercent != null) 'serviceChargePercent': serviceChargePercent,
          if (roundOffEnabled != null) 'roundOffEnabled': roundOffEnabled,
        },
      );
      return Outlet.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
