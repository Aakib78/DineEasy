import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'menu_admin_models.dart';

/// Backs the menu management screens — categories/items/variants. See
/// `menu_admin_models.dart`'s doc comment for why this is a parallel repository/model set rather
/// than an extension of `features/pos/data/menu_repository.dart`.
class MenuAdminRepository {
  MenuAdminRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<MenuCategoryAdmin>> getFullTree() async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>('/menu');
      return (response.data ?? const [])
          .map((c) => MenuCategoryAdmin.fromJson(c as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<MenuCategoryAdmin> createCategory({
    required String name,
    String? description,
    int? displayOrder,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/menu/categories',
        data: {
          'name': name,
          if (description != null && description.isNotEmpty) 'description': description,
          if (displayOrder != null) 'displayOrder': displayOrder,
        },
      );
      return MenuCategoryAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<MenuCategoryAdmin> updateCategory(
    String id, {
    String? name,
    String? description,
    int? displayOrder,
    bool? isActive,
  }) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/menu/categories/$id',
        data: {
          if (name != null) 'name': name,
          if (description != null) 'description': description,
          if (displayOrder != null) 'displayOrder': displayOrder,
          if (isActive != null) 'isActive': isActive,
        },
      );
      return MenuCategoryAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<MenuItemAdmin> createItem({
    required String categoryId,
    required String name,
    String? description,
    String? sku,
    String? imageUrl,
    required String basePrice,
    String? taxGroupId,
    bool? isVegetarian,
    int? displayOrder,
    List<String>? modifierGroupIds,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/menu/items',
        data: {
          'categoryId': categoryId,
          'name': name,
          if (description != null && description.isNotEmpty) 'description': description,
          if (sku != null && sku.isNotEmpty) 'sku': sku,
          if (imageUrl != null && imageUrl.isNotEmpty) 'imageUrl': imageUrl,
          'basePrice': basePrice,
          if (taxGroupId != null && taxGroupId.isNotEmpty) 'taxGroupId': taxGroupId,
          if (isVegetarian != null) 'isVegetarian': isVegetarian,
          if (displayOrder != null) 'displayOrder': displayOrder,
          if (modifierGroupIds != null) 'modifierGroupIds': modifierGroupIds,
        },
      );
      return MenuItemAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<MenuItemAdmin> getItem(String id) async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>('/menu/items/$id');
      return MenuItemAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// `modifierGroupIds`, if provided, *replaces* the item's modifier-group associations
  /// entirely — see `UpdateMenuItemDto`'s backend doc comment. Pass `null` (omit) to leave the
  /// current associations untouched, not an empty list (that would clear them).
  Future<MenuItemAdmin> updateItem(
    String id, {
    String? name,
    String? description,
    String? sku,
    String? imageUrl,
    String? basePrice,
    String? taxGroupId,
    bool clearTaxGroup = false,
    String? categoryId,
    bool? isVegetarian,
    bool? isAvailable,
    bool? isActive,
    int? displayOrder,
    List<String>? modifierGroupIds,
  }) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/menu/items/$id',
        data: {
          if (name != null) 'name': name,
          if (description != null) 'description': description,
          if (sku != null) 'sku': sku,
          if (imageUrl != null) 'imageUrl': imageUrl,
          if (basePrice != null) 'basePrice': basePrice,
          // taxGroupId has no explicit "clear" story on the backend DTO (@IsNotEmpty when
          // provided) — clearing it is done by omission here; clearTaxGroup only exists so
          // call sites can express intent, the request itself just omits the field.
          if (taxGroupId != null && !clearTaxGroup) 'taxGroupId': taxGroupId,
          if (categoryId != null) 'categoryId': categoryId,
          if (isVegetarian != null) 'isVegetarian': isVegetarian,
          if (isAvailable != null) 'isAvailable': isAvailable,
          if (isActive != null) 'isActive': isActive,
          if (displayOrder != null) 'displayOrder': displayOrder,
          if (modifierGroupIds != null) 'modifierGroupIds': modifierGroupIds,
        },
      );
      return MenuItemAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<MenuItemVariantAdmin> addVariant(
    String menuItemId, {
    required String name,
    required String priceOverride,
    bool? isDefault,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/menu/items/$menuItemId/variants',
        data: {
          'name': name,
          'priceOverride': priceOverride,
          if (isDefault != null) 'isDefault': isDefault,
        },
      );
      return MenuItemVariantAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Was a real gap until now — see `UpdateVariantDto`'s backend doc comment: no endpoint ever
  /// touched a variant's name/price/`isActive` after creation.
  Future<MenuItemVariantAdmin> updateVariant(
    String menuItemId,
    String variantId, {
    String? name,
    String? priceOverride,
    bool? isDefault,
    bool? isActive,
  }) async {
    try {
      final response = await _apiClient.dio.patch<Map<String, dynamic>>(
        '/menu/items/$menuItemId/variants/$variantId',
        data: {
          if (name != null) 'name': name,
          if (priceOverride != null) 'priceOverride': priceOverride,
          if (isDefault != null) 'isDefault': isDefault,
          if (isActive != null) 'isActive': isActive,
        },
      );
      return MenuItemVariantAdmin.fromJson(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
