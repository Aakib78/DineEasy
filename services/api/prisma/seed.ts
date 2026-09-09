/**
 * Seeds a realistic demo restaurant (spec §41): "DineEasy Demo Restaurant" — 3 categories,
 * ~20 menu items with variants/modifiers, 10 tables across 2 floors with QR codes, 5 staff
 * accounts (one per system role), and a few sample orders in different lifecycle states.
 *
 * Run with: npm run seed  (see package.json — ts-node prisma/seed.ts)
 *
 * NOTE: this file imports @prisma/client and will not run until `prisma generate` has been
 * executed somewhere with network access to Prisma's engine host — see docs/troubleshooting.md.
 * It has been written carefully against the Prisma 5 client API and schema.prisma, but could
 * not be executed in this sandbox for the same reason migrate/generate couldn't (tracked in
 * docs/architecture.md §15).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES, ALL_PERMISSIONS } from '../src/common/rbac/permissions.catalog';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'DemoPass123!';

async function main() {
  console.log('Seeding DineEasy demo data...');

  // ---------------------------------------------------------------------
  // Organization + Outlet
  // ---------------------------------------------------------------------
  const organization = await prisma.organization.upsert({
    where: { id: 'demo-org' },
    update: {},
    create: {
      id: 'demo-org',
      name: 'DineEasy Demo Restaurant',
      legalName: 'DineEasy Demo Restaurant Pvt Ltd',
      gstin: '07ABCDE1234F1Z5',
      phone: '+91 98765 43210',
      email: 'demo@dineeasy-demo.test',
      addressLine1: '12 Connaught Place',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110001',
      country: 'IN',
      currency: 'INR',
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
    },
  });

  const outlet = await prisma.outlet.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'DED' } },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'DineEasy Demo Restaurant — Connaught Place',
      code: 'DED',
      phone: '+91 98765 43210',
      addressLine1: '12 Connaught Place',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110001',
      gstin: '07ABCDE1234F1Z5',
      serviceChargePercent: 0,
      roundOffEnabled: true,
    },
  });

  // ---------------------------------------------------------------------
  // Permissions + system roles
  // ---------------------------------------------------------------------
  for (const permission of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: { key: permission.key, description: permission.description },
    });
  }
  const allPermissionRows = await prisma.permission.findMany();
  const permissionIdByKey = new Map(allPermissionRows.map((p) => [p.key, p.id]));

  const roleIdByName: Record<string, string> = {};
  for (const roleName of Object.values(SYSTEM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: roleName } },
      update: {},
      create: { organizationId: organization.id, name: roleName, isSystem: true },
    });
    roleIdByName[roleName] = role.id;

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: SYSTEM_ROLE_PERMISSIONS[roleName]
        .map((key) => permissionIdByKey.get(key))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  // ---------------------------------------------------------------------
  // Staff — one per role
  // ---------------------------------------------------------------------
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const staff: { name: string; email: string; role: string; outletScoped: boolean }[] = [
    { name: 'Aarav Owner', email: 'owner@dineeasy-demo.test', role: SYSTEM_ROLES.OWNER, outletScoped: false },
    { name: 'Priya Manager', email: 'manager@dineeasy-demo.test', role: SYSTEM_ROLES.MANAGER, outletScoped: true },
    { name: 'Rohit Cashier', email: 'cashier@dineeasy-demo.test', role: SYSTEM_ROLES.CASHIER, outletScoped: true },
    { name: 'Simran Waiter', email: 'waiter@dineeasy-demo.test', role: SYSTEM_ROLES.WAITER, outletScoped: true },
    { name: 'Karan Kitchen', email: 'kitchen@dineeasy-demo.test', role: SYSTEM_ROLES.KITCHEN, outletScoped: true },
  ];

  for (const s of staff) {
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: organization.id, email: s.email } },
      update: {},
      create: { organizationId: organization.id, name: s.name, email: s.email, passwordHash },
    });

    // Not `upsert` on the `userId_roleId_outletId` compound key: Prisma's generated
    // `WhereUniqueInput` for a compound key including a nullable column (`outletId String?`
    // here — see `UserRole` in schema.prisma) doesn't accept `null` in that position at all,
    // because SQL's `NULL <> NULL` means a plain equality lookup can't reliably mean "the row
    // where this column IS NULL" the way `upsert`/`findUnique` need. `UsersService.
    // removeRoleAssignment` hits the exact same nullable-outletId shape and works around it
    // the same way: a plain (non-compound-key) `where` filter, which has no such restriction —
    // here that means a manual find-or-create instead of `upsert`.
    const outletId = s.outletScoped ? outlet.id : null;
    const existingUserRole = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: roleIdByName[s.role], outletId },
    });
    if (!existingUserRole) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleIdByName[s.role], outletId },
      });
    }
  }
  console.log(`Seeded ${staff.length} staff accounts (password for all: ${DEMO_PASSWORD})`);

  // ---------------------------------------------------------------------
  // Floors + tables + QR codes
  // ---------------------------------------------------------------------
  const floor1 = await prisma.floor.upsert({
    where: { outletId_name: { outletId: outlet.id, name: 'Ground Floor' } },
    update: {},
    create: { outletId: outlet.id, name: 'Ground Floor', displayOrder: 0 },
  });
  const floor2 = await prisma.floor.upsert({
    where: { outletId_name: { outletId: outlet.id, name: 'First Floor' } },
    update: {},
    create: { outletId: outlet.id, name: 'First Floor', displayOrder: 1 },
  });

  for (let i = 1; i <= 10; i++) {
    const floor = i <= 6 ? floor1 : floor2;
    const table = await prisma.restaurantTable.upsert({
      where: { floorId_name: { floorId: floor.id, name: `T${i}` } },
      update: {},
      create: {
        outletId: outlet.id,
        floorId: floor.id,
        name: `T${i}`,
        capacity: i % 3 === 0 ? 6 : 4,
        displayOrder: i,
      },
    });
    await prisma.tableQrCode.upsert({
      where: { tableId: table.id },
      update: {},
      create: { tableId: table.id, token: `demo-qr-${outlet.code.toLowerCase()}-t${i}` },
    });
  }
  console.log('Seeded 2 floors, 10 tables with QR codes');

  // ---------------------------------------------------------------------
  // Tax group (5% GST = 2.5% CGST + 2.5% SGST — typical for restaurant food service)
  // ---------------------------------------------------------------------
  const gst5 = await prisma.taxGroup.upsert({
    where: { id: 'demo-tax-gst5' },
    update: {},
    create: { id: 'demo-tax-gst5', outletId: outlet.id, name: 'GST 5%' },
  });
  await prisma.taxGroupComponent.deleteMany({ where: { taxGroupId: gst5.id } });
  await prisma.taxGroupComponent.createMany({
    data: [
      { taxGroupId: gst5.id, taxType: 'CGST', ratePercent: 2.5 },
      { taxGroupId: gst5.id, taxType: 'SGST', ratePercent: 2.5 },
    ],
  });

  // ---------------------------------------------------------------------
  // Menu — 3 categories, ~20 items, with variants + modifiers
  // ---------------------------------------------------------------------
  const menu = await prisma.menu.upsert({
    where: { id: 'demo-menu' },
    update: {},
    create: { id: 'demo-menu', outletId: outlet.id, name: 'Main Menu' },
  });

  const spiceLevel = await upsertModifierGroup('demo-mg-spice', outlet.id, 'Spice Level', 0, 1, false, [
    'Mild',
    'Medium',
    'Hot',
  ]);
  const toppings = await upsertModifierGroup('demo-mg-toppings', outlet.id, 'Extra Toppings', 0, 4, false, [
    { name: 'Extra Cheese', price: 40 },
    { name: 'Jalapeño', price: 20 },
    { name: 'Mushroom', price: 30 },
    { name: 'Paneer', price: 50 },
  ]);

  const categories: { name: string; items: SeedItem[] }[] = [
    {
      name: 'Starters',
      items: [
        item('Paneer Tikka', 220, ['Spice'], []),
        item('Veg Spring Roll', 180, [], []),
        item('Chicken 65', 260, ['Spice'], []),
        item('Hara Bhara Kebab', 200, [], []),
        item('Chilli Paneer', 230, ['Spice'], []),
        item('Tandoori Chicken (Half)', 320, ['Spice'], []),
        item('Crispy Corn', 190, [], []),
      ],
    },
    {
      name: 'Main Course',
      items: [
        item('Butter Chicken', 340, [], [], variants(['Half', 'Full'], [220, 340])),
        item('Dal Makhani', 220, [], []),
        item('Paneer Butter Masala', 280, [], []),
        item('Veg Biryani', 240, ['Spice'], []),
        item('Chicken Biryani', 300, ['Spice'], []),
        item('Kadai Paneer', 260, ['Spice'], []),
        item('Palak Paneer', 250, [], []),
        item('Rogan Josh', 360, ['Spice'], []),
        item('Margherita Pizza', 280, [], ['Toppings'], variants(['Small', 'Medium', 'Large'], [220, 280, 350])),
        item('Farmhouse Pizza', 320, [], ['Toppings'], variants(['Small', 'Medium', 'Large'], [260, 320, 400])),
      ],
    },
    {
      name: 'Beverages & Desserts',
      items: [
        item('Masala Chai', 60, [], []),
        item('Fresh Lime Soda', 90, [], []),
        item('Cold Coffee', 140, [], []),
        item('Mango Lassi', 130, [], []),
        item('Gulab Jamun (2 pc)', 110, [], []),
        item('Chocolate Brownie', 160, [], []),
      ],
    },
  ];

  let categoryOrder = 0;
  for (const cat of categories) {
    const category = await prisma.menuCategory.upsert({
      where: { id: `demo-cat-${slug(cat.name)}` },
      update: {},
      create: { id: `demo-cat-${slug(cat.name)}`, menuId: menu.id, name: cat.name, displayOrder: categoryOrder++ },
    });

    let itemOrder = 0;
    for (const it of cat.items) {
      const menuItem = await prisma.menuItem.upsert({
        where: { id: `demo-item-${slug(it.name)}` },
        update: {},
        create: {
          id: `demo-item-${slug(it.name)}`,
          categoryId: category.id,
          taxGroupId: gst5.id,
          name: it.name,
          basePrice: it.price,
          displayOrder: itemOrder++,
        },
      });

      if (it.variants) {
        for (const v of it.variants) {
          await prisma.menuItemVariant.upsert({
            where: { id: `demo-variant-${slug(it.name)}-${slug(v.name)}` },
            update: {},
            create: {
              id: `demo-variant-${slug(it.name)}-${slug(v.name)}`,
              menuItemId: menuItem.id,
              name: v.name,
              priceOverride: v.price,
              isDefault: v.isDefault ?? false,
            },
          });
        }
      }

      if (it.modifierGroups.includes('Spice')) {
        await prisma.menuItemModifierGroup.upsert({
          where: { menuItemId_modifierGroupId: { menuItemId: menuItem.id, modifierGroupId: spiceLevel.id } },
          update: {},
          create: { menuItemId: menuItem.id, modifierGroupId: spiceLevel.id },
        });
      }
      if (it.modifierGroups.includes('Toppings')) {
        await prisma.menuItemModifierGroup.upsert({
          where: { menuItemId_modifierGroupId: { menuItemId: menuItem.id, modifierGroupId: toppings.id } },
          update: {},
          create: { menuItemId: menuItem.id, modifierGroupId: toppings.id },
        });
      }
    }
  }

  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);
  console.log(`Seeded ${categories.length} categories, ${totalItems} menu items`);

  console.log('\nDone. Demo login (any of these, password is the same):');
  for (const s of staff) console.log(`  ${s.role.padEnd(9)} ${s.email}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SeedItem {
  name: string;
  price: number;
  modifierGroups: string[];
  variants?: { name: string; price: number; isDefault?: boolean }[];
}

function item(name: string, price: number, _spice: string[], modifierGroups: string[], variantsList?: SeedItem['variants']): SeedItem {
  return { name, price, modifierGroups: [..._spice.map(() => 'Spice'), ...modifierGroups], variants: variantsList };
}

function variants(names: string[], prices: number[]): SeedItem['variants'] {
  return names.map((name, i) => ({ name, price: prices[i], isDefault: i === 0 }));
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function upsertModifierGroup(
  id: string,
  outletId: string,
  name: string,
  minSelect: number,
  maxSelect: number,
  isRequired: boolean,
  modifiers: (string | { name: string; price: number })[],
) {
  const group = await prisma.modifierGroup.upsert({
    where: { id },
    update: {},
    create: { id, outletId, name, minSelect, maxSelect, isRequired },
  });

  let order = 0;
  for (const m of modifiers) {
    const name2 = typeof m === 'string' ? m : m.name;
    const price = typeof m === 'string' ? 0 : m.price;
    await prisma.modifier.upsert({
      where: { id: `${id}-${slug(name2)}` },
      update: {},
      create: { id: `${id}-${slug(name2)}`, modifierGroupId: group.id, name: name2, priceDelta: price, displayOrder: order++ },
    });
  }
  return group;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
