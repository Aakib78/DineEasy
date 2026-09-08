import 'package:dio/dio.dart';

/// A normalized API error, translated from Dio's exception zoo plus the backend's
/// `DomainExceptionFilter` error body shape (`{code, message}` — see
/// services/api/src/common/errors — kept intentionally simple; a richer `{code, message,
/// details}` contract can grow here if a specific screen needs field-level validation errors).
class ApiException implements Exception {
  const ApiException({required this.message, this.statusCode, this.code});

  factory ApiException.fromDioException(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return const ApiException(
        message: "Couldn't reach the server — check you're on the restaurant Wi-Fi.",
      );
    }
    if (e.type == DioExceptionType.connectionError) {
      return const ApiException(
        message: 'No connection to the server. It may be offline or you may be off the LAN.',
      );
    }

    final response = e.response;
    if (response == null) {
      return ApiException(message: e.message ?? 'Unexpected network error.');
    }

    final data = response.data;
    final serverMessage = data is Map<String, dynamic> ? data['message'] : null;
    final serverCode = data is Map<String, dynamic> ? data['code'] : null;

    return ApiException(
      message: (serverMessage is String && serverMessage.isNotEmpty)
          ? serverMessage
          : 'Request failed (${response.statusCode}).',
      statusCode: response.statusCode,
      code: serverCode is String ? serverCode : null,
    );
  }

  final String message;
  final int? statusCode;
  final String? code;

  bool get isUnauthenticated => statusCode == 401;
  bool get isForbidden => statusCode == 403;

  @override
  String toString() => 'ApiException($statusCode${code != null ? ' $code' : ''}: $message)';
}
