import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/core/auth/jwt_decoder.dart';

/// Builds a syntactically-valid JWT (header.payload.signature) for testing. The signature
/// segment is a dummy — JwtDecoder never verifies it (see the class doc comment for why that's
/// intentional), so tests don't need a real signing key.
String _fakeJwt(Map<String, dynamic> payload) {
  String segment(Map<String, dynamic> json) =>
      base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  final header = segment({'alg': 'HS256', 'typ': 'JWT'});
  final body = segment(payload);
  return '$header.$body.dummy-signature';
}

void main() {
  group('JwtDecoder.decodePayload', () {
    test('decodes a well-formed JWT payload', () {
      final token = _fakeJwt({'sub': 'user-1', 'name': 'Aakib'});
      final payload = JwtDecoder.decodePayload(token);
      expect(payload['sub'], 'user-1');
      expect(payload['name'], 'Aakib');
    });

    test('throws FormatException for a token without 3 segments', () {
      expect(() => JwtDecoder.decodePayload('not-a-jwt'), throwsFormatException);
    });

    test('handles base64url payloads that need padding restored', () {
      // Deliberately construct a payload whose base64 length isn't a multiple of 4, to
      // exercise base64Url.normalize (Dart's base64Url.decode is strict about padding).
      final token = _fakeJwt({'a': 1});
      expect(() => JwtDecoder.decodePayload(token), returnsNormally);
    });
  });

  group('JwtDecoder.isExpired', () {
    test('returns false when exp is in the future', () {
      final futureExp = DateTime.now().toUtc().add(const Duration(hours: 1));
      final token = _fakeJwt({'exp': futureExp.millisecondsSinceEpoch ~/ 1000});
      expect(JwtDecoder.isExpired(token), isFalse);
    });

    test('returns true when exp is in the past', () {
      final pastExp = DateTime.now().toUtc().subtract(const Duration(hours: 1));
      final token = _fakeJwt({'exp': pastExp.millisecondsSinceEpoch ~/ 1000});
      expect(JwtDecoder.isExpired(token), isTrue);
    });

    test('applies the leeway window so a token about to expire counts as expired', () {
      final almostExpired = DateTime.now().toUtc().add(const Duration(seconds: 10));
      final token = _fakeJwt({'exp': almostExpired.millisecondsSinceEpoch ~/ 1000});
      expect(JwtDecoder.isExpired(token, leeway: const Duration(seconds: 30)), isTrue);
    });

    test('returns false (assume valid) when there is no exp claim at all', () {
      final token = _fakeJwt({'sub': 'user-1'});
      expect(JwtDecoder.isExpired(token), isFalse);
    });
  });
}
