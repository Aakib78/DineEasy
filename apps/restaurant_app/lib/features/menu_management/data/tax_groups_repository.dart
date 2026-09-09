import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'menu_admin_models.dart';

class TaxComponentInput {
  const TaxComponentInput({required this.taxType, required this.ratePercent});

  final TaxType taxType;
  final String ratePercent;

  Map<String, dynamic> toJson() => {'taxType': taxTypeToJson(taxType), 'ratePercent': ratePercent};
}

class TaxGroupsRepository {
  TaxGroupsRepository(this._apiClient);

  final ApiClient _apiClient;

  /// `includeInactive` defaults off, matching the backend's own default — see the identical
  /// comment on `ModifierGroupsRepository.list` for why this is opt-in.
  Future<List<TaxGroup>> list({bool includeInactive = false}) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>(
        '/tax-groups',
        queryParameters: includeInactive ? {'includeInactive': 'true'} : null,
      );
      return (response.data ?? const [])
          .map((g) => TaxGroup.fromJson(g as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<TaxGroup> getOne(String id) async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>('/tax-groups/$id');
      return TaxGroup.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<TaxGroup> create({
    required String name,
    required List<TaxComponentInput> components,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/tax-groups',
        data: {'name': name, 'components': components.map((c) => c.toJson()).toList()},
      );
      return TaxGroup.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Was a real gap — `TaxGroup` had no update/delete endpoint at all until now. Still only
  /// name + `isActive`: no endpoint edits an existing `TaxGroupComponent`'s rate in place (see
  /// `UpdateTaxGroupDto`'s backend doc comment) — a rate change means deactivating this group and
  /// creating a new one.
  Future<TaxGroup> update(String id, {String? name, bool? isActive}) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/tax-groups/$id',
        data: {if (name != null) 'name': name, if (isActive != null) 'isActive': isActive},
      );
      return TaxGroup.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
