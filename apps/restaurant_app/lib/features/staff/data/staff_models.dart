/// Data models for the `staff.view`/`staff.manage`-gated `/staff` endpoints
/// (`services/api/src/modules/users/users.controller.ts`, mapped under `@Controller('staff')`
/// on the backend despite the Prisma model being named `User` — this app follows the same
/// "staff" naming the wire contract and the nav shell destination both use).
library;

enum StaffStatus { active, inactive, suspended }

StaffStatus _statusFromJson(String raw) => switch (raw) {
      'ACTIVE' => StaffStatus.active,
      'INACTIVE' => StaffStatus.inactive,
      'SUSPENDED' => StaffStatus.suspended,
      _ => throw ArgumentError('Unknown staff status: $raw'),
    };

String staffStatusToJson(StaffStatus status) => switch (status) {
      StaffStatus.active => 'ACTIVE',
      StaffStatus.inactive => 'INACTIVE',
      StaffStatus.suspended => 'SUSPENDED',
    };

/// One `UserRole` row, flattened — a staff member can hold **more than one** of these
/// simultaneously (e.g. "Manager @ Outlet A" and "Cashier @ Outlet B"), since
/// `UsersService.update`'s role-reassignment only deletes-and-recreates the row matching the
/// *same* `outletId` it was given, not every row the user has (see `StaffRepository.updateStaff`'s
/// doc comment). `outletId`/`outletName` are both null for an org-wide assignment (in practice,
/// only ever the Owner role — enforced in backend service logic, not by the schema).
class StaffRoleAssignment {
  const StaffRoleAssignment({
    required this.roleId,
    required this.roleName,
    required this.outletId,
    required this.outletName,
  });

  factory StaffRoleAssignment.fromJson(Map<String, dynamic> json) {
    final role = json['role'] as Map<String, dynamic>;
    final outlet = json['outlet'] as Map<String, dynamic>?;
    return StaffRoleAssignment(
      roleId: role['id'] as String,
      roleName: role['name'] as String,
      outletId: outlet?['id'] as String?,
      outletName: outlet?['name'] as String?,
    );
  }

  final String roleId;
  final String roleName;
  final String? outletId;
  final String? outletName;
}

class StaffMember {
  const StaffMember({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.status,
    required this.roles,
  });

  factory StaffMember.fromJson(Map<String, dynamic> json) {
    return StaffMember(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      phone: json['phone'] as String?,
      status: _statusFromJson(json['status'] as String),
      roles: (json['roles'] as List<dynamic>? ?? const [])
          .map((r) => StaffRoleAssignment.fromJson(r as Map<String, dynamic>))
          .toList(),
    );
  }

  final String id;
  final String name;
  final String email;
  final String? phone;
  final StaffStatus status;
  final List<StaffRoleAssignment> roles;
}

/// Just enough of `Role` to populate a role-assignment dropdown — `RolesController.listRoles`
/// also returns each role's full permission list (for a future Roles-admin/permission-checkbox
/// screen, per its own doc comment on the backend), which this slice doesn't need and doesn't
/// parse.
class StaffRole {
  const StaffRole({required this.id, required this.name, required this.isSystem});

  factory StaffRole.fromJson(Map<String, dynamic> json) {
    return StaffRole(
      id: json['id'] as String,
      name: json['name'] as String,
      isSystem: json['isSystem'] as bool? ?? false,
    );
  }

  final String id;
  final String name;

  /// One of the 5 seeded system roles (Owner/Manager/Cashier/Waiter/Kitchen) vs. a
  /// custom role an organization created for itself. Not currently surfaced in the UI — kept
  /// for whenever a custom-roles screen distinguishes "built-in, can't rename" from "custom".
  final bool isSystem;
}

/// Just enough of `Outlet` to populate the "which outlet is this role for" dropdown when
/// assigning staff — `OutletsController.list` has no permission gate beyond being signed in, so
/// every staff member can resolve outlet names for display even without `settings.manage`.
class StaffOutlet {
  const StaffOutlet({required this.id, required this.name});

  factory StaffOutlet.fromJson(Map<String, dynamic> json) {
    return StaffOutlet(id: json['id'] as String, name: json['name'] as String);
  }

  final String id;
  final String name;
}
