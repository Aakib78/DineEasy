import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import 'notification_models.dart';

class NotificationsRepository {
  NotificationsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<AppNotification>> list({bool unreadOnly = false}) async {
    try {
      final response = await _apiClient.dio.get<List<dynamic>>(
        '/notifications',
        queryParameters: unreadOnly ? {'unread': 'true'} : null,
      );
      return (response.data ?? const [])
          .map((n) => AppNotification.fromJson(n as Map<String, dynamic>))
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<int> unreadCount() async {
    try {
      final response = await _apiClient.dio.get<Map<String, dynamic>>(
        '/notifications/unread-count',
      );
      return response.data?['count'] as int? ?? 0;
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> markRead(String id) async {
    try {
      await _apiClient.dio.patch<void>('/notifications/$id/read');
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> markAllRead() async {
    try {
      await _apiClient.dio.patch<void>('/notifications/read-all');
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
