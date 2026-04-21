import { and, eq } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';

import { closeDatabase, createDatabaseConnection } from './database.js';
import {
  locations,
  patients,
  permissions,
  rolePermissions,
  roles,
  tenants,
  userTenants,
  users,
} from './schema/index.js';

interface SeedContext {
  tenantId: string;
  locationId: string;
  adminUserId: string;
  roleIds: Record<string, string>;
  permissionIds: Record<string, string>;
}

async function getOrCreateTenant(tenantName: string): Promise<string> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.name, tenantName), eq(tenants.type, 'SOLO_PRACTICE')))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(tenants)
    .values({
      name: tenantName,
      type: 'SOLO_PRACTICE',
      primaryRegion: 'eu-central-1',
      defaultLocale: 'en-US',
      supportedLocales: ['en-US'],
      supportedLanguages: ['en'],
      partitionStrategy: 'ROW_LEVEL',
      status: 'ACTIVE',
    })
    .returning({ id: tenants.id });

  return inserted[0].id;
}

async function getOrCreateLocation(tenantId: string, locationName: string): Promise<string> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.tenantId, tenantId), eq(locations.name, locationName)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(locations)
    .values({
      tenantId,
      name: locationName,
      timezone: 'Europe/Berlin',
      status: 'ACTIVE',
      address: {
        line1: '100 Main Street',
        city: 'Berlin',
        country: 'DE',
      },
    })
    .returning({ id: locations.id });

  return inserted[0].id;
}

async function getOrCreateAdminUser(adminEmail: string): Promise<string> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(users)
    .values({
      email: adminEmail,
      fullName: 'Demo Admin',
      preferredLocale: 'en-US',
      preferredLanguage: 'en',
      status: 'ACTIVE',
    })
    .returning({ id: users.id });

  return inserted[0].id;
}

async function ensureUserTenant(
  userId: string,
  tenantId: string,
  defaultLocationId: string
): Promise<void> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ userId: userTenants.userId })
    .from(userTenants)
    .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
    .limit(1);

  if (!existing[0]) {
    await db.insert(userTenants).values({
      userId,
      tenantId,
      defaultLocationId,
      userType: 'ADMIN',
    });
  }
}

async function getOrCreateRole(
  tenantId: string,
  name: string,
  description: string
): Promise<string> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.name, name)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(roles)
    .values({
      tenantId,
      name,
      description,
    })
    .returning({ id: roles.id });

  return inserted[0].id;
}

async function getOrCreatePermission(key: string, description: string): Promise<string> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: permissions.id })
    .from(permissions)
    .where(eq(permissions.key, key))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(permissions)
    .values({
      key,
      description,
    })
    .returning({ id: permissions.id });

  return inserted[0].id;
}

async function ensureRolePermission(roleId: string, permissionId: string): Promise<void> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ roleId: rolePermissions.roleId })
    .from(rolePermissions)
    .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)))
    .limit(1);

  if (!existing[0]) {
    await db.insert(rolePermissions).values({ roleId, permissionId });
  }
}

async function ensureSamplePatient(
  tenantId: string,
  locationId: string,
  firstName: string,
  lastName: string,
  dob: string
): Promise<void> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.tenantId, tenantId),
        eq(patients.firstName, firstName),
        eq(patients.lastName, lastName)
      )
    )
    .limit(1);

  if (!existing[0]) {
    await db.insert(patients).values({
      tenantId,
      primaryLocationId: locationId,
      firstName,
      lastName,
      dob,
      status: 'ACTIVE',
      preferredLocale: 'en-US',
      preferredLanguage: 'en',
    });
  }
}

export async function seedDatabase(): Promise<SeedContext> {
  const tenantId = await getOrCreateTenant('Demo Dental Practice');
  const locationId = await getOrCreateLocation(tenantId, 'Main Clinic');
  const adminUserId = await getOrCreateAdminUser('admin@demo-dental.local');

  await ensureUserTenant(adminUserId, tenantId, locationId);

  const roleIds = {
    ADMIN: await getOrCreateRole(tenantId, 'Admin', 'Full tenant administration access'),
    DENTIST: await getOrCreateRole(tenantId, 'Dentist', 'Clinical provider role'),
    HYGIENIST: await getOrCreateRole(tenantId, 'Hygienist', 'Preventive care role'),
    FRONT_DESK: await getOrCreateRole(tenantId, 'Front Desk', 'Patient intake and scheduling role'),
  };

  const permissionIds = {
    USERS_MANAGE: await getOrCreatePermission('users:manage', 'Create, update, and disable users'),
    PATIENTS_READ: await getOrCreatePermission('patients:read', 'Read patient records'),
    PATIENTS_WRITE: await getOrCreatePermission(
      'patients:write',
      'Create and update patient records'
    ),
    SCHEDULE_MANAGE: await getOrCreatePermission(
      'schedule:manage',
      'Manage appointments and encounters'
    ),
  };

  await ensureRolePermission(roleIds.ADMIN, permissionIds.USERS_MANAGE);
  await ensureRolePermission(roleIds.ADMIN, permissionIds.PATIENTS_READ);
  await ensureRolePermission(roleIds.ADMIN, permissionIds.PATIENTS_WRITE);
  await ensureRolePermission(roleIds.ADMIN, permissionIds.SCHEDULE_MANAGE);
  await ensureRolePermission(roleIds.DENTIST, permissionIds.PATIENTS_READ);
  await ensureRolePermission(roleIds.DENTIST, permissionIds.PATIENTS_WRITE);
  await ensureRolePermission(roleIds.HYGIENIST, permissionIds.PATIENTS_READ);
  await ensureRolePermission(roleIds.FRONT_DESK, permissionIds.SCHEDULE_MANAGE);

  await ensureSamplePatient(tenantId, locationId, 'Jane', 'Doe', '1992-04-12');
  await ensureSamplePatient(tenantId, locationId, 'John', 'Smith', '1986-10-03');

  return {
    tenantId,
    locationId,
    adminUserId,
    roleIds,
    permissionIds,
  };
}

async function run(): Promise<void> {
  try {
    const result = await seedDatabase();
    console.log('Seed data inserted successfully.');
    console.log(result);
  } finally {
    await closeDatabase();
  }
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectRun) {
  run().catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
}
