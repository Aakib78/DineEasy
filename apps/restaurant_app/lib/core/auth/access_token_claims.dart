import 'package:equatable/equatable.dart';

import 'jwt_decoder.dart';

/// Mirrors `AccessTokenPayload` in
/// `services/api/src/modules/auth/types/authenticated-user.type.ts`. `permissions` is the
/// user's *effective* permission set at token-issue time (role permissions flattened) — see
/// docs/authentication.md for why that's a deliberate snapshot-vs-live tradeoff (a permission
/// change takes effect on that user's next token refresh, not instantly).
class AccessTokenClaims extends Equatable {
  const AccessTokenClaims({
    required this.userId,
    required this.organizationId,
    required this.activeOutletId,
    required this.permissions,
    required this.name,
    required this.email,
  });

  factory AccessTokenClaims.fromToken(String accessToken) {
    final payload = JwtDecoder.decodePayload(accessToken);
    return AccessTokenClaims(
      userId: payload['sub'] as String,
      organizationId: payload['organizationId'] as String,
      activeOutletId: payload['activeOutletId'] as String?,
      permissions: (payload['permissions'] as List<dynamic>? ?? const [])
          .map((p) => p.toString())
          .toSet(),
      name: payload['name'] as String,
      email: payload['email'] as String,
    );
  }

  final String userId;
  final String organizationId;

  /// Null means the staff member has no outlet assigned yet — most routes need one, and the
  /// UI should show a clear "ask your manager to assign you to an outlet" state rather than a
  /// confusing empty screen (see HomeShell).
  final String? activeOutletId;

  final Set<String> permissions;
  final String name;
  final String email;

  bool hasPermission(String permission) => permissions.contains(permission);

  bool hasAnyPermission(Iterable<String> candidates) =>
      candidates.any(permissions.contains);

  @override
  List<Object?> get props => [
    userId,
    organizationId,
    activeOutletId,
    permissions,
    name,
    email,
  ];
}
