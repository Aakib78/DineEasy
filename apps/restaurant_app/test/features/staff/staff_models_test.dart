import 'package:flutter_test/flutter_test.dart';

import 'package:dineeasy_staff/features/staff/data/staff_models.dart';

void main() {
  group('StaffMember.fromJson', () {
    test('parses a staff member with a single outlet-scoped role', () {
      final member = StaffMember.fromJson({
        'id': 'u-1',
        'name': 'Priya Sharma',
        'email': 'priya@example.com',
        'phone': '9876543210',
        'status': 'ACTIVE',
        'roles': [
          {
            'id': 'ur-1',
            'role': {'id': 'r-1', 'name': 'Manager', 'isSystem': true},
            'outlet': {'id': 'o-1', 'name': 'Connaught Place'},
          },
        ],
      });

      expect(member.name, 'Priya Sharma');
      expect(member.status, StaffStatus.active);
      expect(member.roles, hasLength(1));
      expect(member.roles.single.roleName, 'Manager');
      expect(member.roles.single.outletName, 'Connaught Place');
    });

    test('parses an org-wide role assignment (null outlet)', () {
      final member = StaffMember.fromJson({
        'id': 'u-2',
        'name': 'Owner Account',
        'email': 'owner@example.com',
        'status': 'ACTIVE',
        'roles': [
          {
            'id': 'ur-2',
            'role': {'id': 'r-2', 'name': 'Owner', 'isSystem': true},
            'outlet': null,
          },
        ],
      });

      expect(member.roles.single.outletId, isNull);
      expect(member.roles.single.outletName, isNull);
    });

    test('parses multiple simultaneous role assignments across outlets', () {
      final member = StaffMember.fromJson({
        'id': 'u-3',
        'name': 'Multi Outlet Manager',
        'email': 'multi@example.com',
        'status': 'ACTIVE',
        'roles': [
          {
            'id': 'ur-3',
            'role': {'id': 'r-1', 'name': 'Manager', 'isSystem': true},
            'outlet': {'id': 'o-1', 'name': 'Connaught Place'},
          },
          {
            'id': 'ur-4',
            'role': {'id': 'r-3', 'name': 'Cashier', 'isSystem': true},
            'outlet': {'id': 'o-2', 'name': 'Faridabad'},
          },
        ],
      });

      expect(member.roles, hasLength(2));
    });

    test('defaults phone to null and roles to empty when omitted', () {
      final member = StaffMember.fromJson({
        'id': 'u-4',
        'name': 'No Role Yet',
        'email': 'norole@example.com',
        'status': 'INACTIVE',
      });

      expect(member.phone, isNull);
      expect(member.roles, isEmpty);
      expect(member.status, StaffStatus.inactive);
    });

    test('throws for an unrecognized status rather than silently defaulting', () {
      expect(
        () => StaffMember.fromJson({
          'id': 'u-5',
          'name': 'Bad Status',
          'email': 'bad@example.com',
          'status': 'ON_LEAVE',
        }),
        throwsArgumentError,
      );
    });
  });

  group('staffStatusToJson', () {
    test('round-trips every status value', () {
      for (final status in StaffStatus.values) {
        final json = staffStatusToJson(status);
        final member = StaffMember.fromJson({
          'id': 'u-x',
          'name': 'X',
          'email': 'x@example.com',
          'status': json,
        });
        expect(member.status, status);
      }
    });
  });

  group('StaffRole.fromJson / StaffOutlet.fromJson', () {
    test('parses minimal role and outlet rows', () {
      final role = StaffRole.fromJson({'id': 'r-1', 'name': 'Waiter', 'isSystem': true});
      final outlet = StaffOutlet.fromJson({'id': 'o-1', 'name': 'Faridabad'});

      expect(role.name, 'Waiter');
      expect(role.isSystem, isTrue);
      expect(outlet.name, 'Faridabad');
    });
  });
}
