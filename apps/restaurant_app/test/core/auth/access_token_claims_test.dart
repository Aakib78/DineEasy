import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/core/auth/access_token_claims.dart';
import 'package:dineeasy_staff/core/rbac/permissions.dart';

String _fakeJwt(Map<String, dynamic> payload) {
  String segment(Map<String, dynamic> json) =>
      base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  return '${segment({
    'alg': 'HS256',
  })}.${segment(payload)}.dummy-signature';
}

void main() {
  test('fromToken decodes every AccessTokenPayload field', () {
    final token = _fakeJwt({
      'sub': 'user-1',
      'organizationId': 'org-1',
      'activeOutletId': 'outlet-1',
      'permissions': [Permissions.ordersCreate, Permissions.tablesView],
      'name': 'Aakib Khan',
      'email': 'aakib@example.com',
    });

    final claims = AccessTokenClaims.fromToken(token);

    expect(claims.userId, 'user-1');
    expect(claims.organizationId, 'org-1');
    expect(claims.activeOutletId, 'outlet-1');
    expect(claims.name, 'Aakib Khan');
    expect(claims.email, 'aakib@example.com');
    expect(claims.permissions, {Permissions.ordersCreate, Permissions.tablesView});
  });

  test('activeOutletId is null when the claim is absent (not yet assigned to an outlet)', () {
    final token = _fakeJwt({
      'sub': 'user-1',
      'organizationId': 'org-1',
      'permissions': <String>[],
      'name': 'Aakib Khan',
      'email': 'aakib@example.com',
    });

    expect(AccessTokenClaims.fromToken(token).activeOutletId, isNull);
  });

  test('hasPermission reflects the decoded permission set', () {
    final token = _fakeJwt({
      'sub': 'user-1',
      'organizationId': 'org-1',
      'permissions': [Permissions.kitchenView],
      'name': 'Kitchen Staff',
      'email': 'kitchen@example.com',
    });
    final claims = AccessTokenClaims.fromToken(token);

    expect(claims.hasPermission(Permissions.kitchenView), isTrue);
    expect(claims.hasPermission(Permissions.staffManage), isFalse);
  });

  test('hasAnyPermission is true if the user holds at least one of the candidates', () {
    final token = _fakeJwt({
      'sub': 'user-1',
      'organizationId': 'org-1',
      'permissions': [Permissions.billingView],
      'name': 'Cashier',
      'email': 'cashier@example.com',
    });
    final claims = AccessTokenClaims.fromToken(token);

    expect(
      claims.hasAnyPermission([Permissions.staffManage, Permissions.billingView]),
      isTrue,
    );
    expect(
      claims.hasAnyPermission([Permissions.staffManage, Permissions.printersManage]),
      isFalse,
    );
  });

  test('two claims decoded from equivalent payloads are equal (Equatable)', () {
    final payload = {
      'sub': 'user-1',
      'organizationId': 'org-1',
      'activeOutletId': 'outlet-1',
      'permissions': [Permissions.ordersCreate],
      'name': 'Aakib Khan',
      'email': 'aakib@example.com',
    };
    final a = AccessTokenClaims.fromToken(_fakeJwt(payload));
    final b = AccessTokenClaims.fromToken(_fakeJwt(payload));
    expect(a, equals(b));
  });
}
