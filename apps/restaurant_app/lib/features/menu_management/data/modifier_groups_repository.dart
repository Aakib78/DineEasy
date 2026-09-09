import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'menu_admin_models.dart';

/// A modifier to create alongside a new group — `POST /modifier-groups` still requires at least
/// one (`CreateModifierGroupDto.modifiers` is `@ArrayMinSize(1)`), unlike updating a group later.
class ModifierInput {
  const ModifierInput({required this.name, this.priceDelta});

  final String name;
  final String? priceDelta;

  Map<String, dynamic> toJson() => {'name': name, if (priceDelta != null) 'priceDelta': priceDelta};
}

class ModifierGroupsRepository {
  ModifierGroupsRepository(this._apiClient);

  final ApiClient _apiClient;

  /// `includeInactive` defaults off, matching the backend's own default. Pass `true` from the
  /// standalone management screen (which needs to show — and let staff reactivate — a
  /// deactivated group); leave it `false` for a picker that's choosing which groups to newly
  /// attach to a menu item, where an inactive one shouldn't be offered.
  Future<List<ModifierGroupAdmin>> list({bool includeInactive = false}) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>(
        '/modifier-groups',
        queryParameters: includeInactive ? {'includeInactive': 'true'} : null,
      );
      return (response.data ?? const [])
          .map((g) => ModifierGroupAdmin.fromJson(g as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<ModifierGroupAdmin> getOne(String id) async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>('/modifier-groups/$id');
      return ModifierGroupAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<ModifierGroupAdmin> create({
    required String name,
    int? minSelect,
    int? maxSelect,
    bool? isRequired,
    required List<ModifierInput> modifiers,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/modifier-groups',
        data: {
          'name': name,
          if (minSelect != null) 'minSelect': minSelect,
          if (maxSelect != null) 'maxSelect': maxSelect,
          if (isRequired != null) 'isRequired': isRequired,
          'modifiers': modifiers.map((m) => m.toJson()).toList(),
        },
      );
      return ModifierGroupAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<ModifierGroupAdmin> update(
    String id, {
    String? name,
    int? minSelect,
    int? maxSelect,
    bool? isRequired,
    bool? isActive,
  }) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/modifier-groups/$id',
        data: {
          if (name != null) 'name': name,
          if (minSelect != null) 'minSelect': minSelect,
          if (maxSelect != null) 'maxSelect': maxSelect,
          if (isRequired != null) 'isRequired': isRequired,
          if (isActive != null) 'isActive': isActive,
        },
      );
      return ModifierGroupAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Was the biggest gap in this module — see `ModifiersService.addModifier`'s backend doc
  /// comment: adding one modifier to an existing group had no endpoint until now.
  Future<ModifierAdmin> addModifier(
    String groupId, {
    required String name,
    String? priceDelta,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/modifier-groups/$groupId/modifiers',
        data: {'name': name, if (priceDelta != null) 'priceDelta': priceDelta},
      );
      return ModifierAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<ModifierAdmin> updateModifier(
    String groupId,
    String modifierId, {
    String? name,
    String? priceDelta,
    bool? isActive,
  }) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/modifier-groups/$groupId/modifiers/$modifierId',
        data: {
          if (name != null) 'name': name,
          if (priceDelta != null) 'priceDelta': priceDelta,
          if (isActive != null) 'isActive': isActive,
        },
      );
      return ModifierAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
