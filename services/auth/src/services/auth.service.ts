import { hash, compare } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { createDatabaseConnection } from '../../../../packages/config/src/database.js';
import { userAuthIdentities } from '../../../../packages/config/src/schema/tenancy-governance.js';
import { userTenants, users } from '../../../../packages/config/src/schema/tenancy.js';
import type { LoginRequest, RegisterRequest } from '../schemas/common.schema.js';
import { issueTokenPair } from './token.service.js';
import { createSession, revokeSession } from './session.service.js';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

export interface LoginResult {
  user: AuthUser;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(payload: RegisterRequest): Promise<AuthUser> {
  const db = createDatabaseConnection();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, payload.email))
    .limit(1);
  if (existing[0]) {
    throw new Error('User with this email already exists.');
  }

  const passwordHash = await hash(payload.password, 12);
  const insertedUser = await db
    .insert(users)
    .values({
      email: payload.email,
      fullName: payload.fullName,
      status: 'ACTIVE',
      preferredLocale: 'en-US',
      preferredLanguage: 'en',
    })
    .returning({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
    });

  const user = insertedUser[0];

  await db.insert(userTenants).values({
    userId: user.id,
    tenantId: payload.tenantId,
    userType: 'ADMIN',
  });

  await db.insert(userAuthIdentities).values({
    userId: user.id,
    provider: 'password',
    providerUserId: payload.email,
    email: payload.email,
    passwordHash,
  });

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
  };
}

export async function loginUser(payload: LoginRequest): Promise<LoginResult> {
  const db = createDatabaseConnection();
  const records = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      passwordHash: userAuthIdentities.passwordHash,
      tenantId: userTenants.tenantId,
      userType: userTenants.userType,
    })
    .from(users)
    .innerJoin(userAuthIdentities, eq(userAuthIdentities.userId, users.id))
    .innerJoin(userTenants, eq(userTenants.userId, users.id))
    .where(
      and(
        eq(users.email, payload.email),
        eq(userAuthIdentities.provider, 'password'),
        eq(userTenants.tenantId, payload.tenantId)
      )
    )
    .limit(1);

  const record = records[0];
  if (!record?.passwordHash) {
    throw new Error('Invalid credentials.');
  }

  const passwordMatches = await compare(payload.password, record.passwordHash);
  if (!passwordMatches) {
    throw new Error('Invalid credentials.');
  }

  const user: AuthUser = {
    id: record.userId,
    email: record.email,
    fullName: record.fullName,
  };

  const sessionId = randomUUID();

  const tokenPair = await issueTokenPair({
    userId: user.id,
    tenantId: payload.tenantId,
    sessionId,
    roles: [record.userType],
    permissions: ['users:manage', 'patients:read', 'patients:write', 'schedule:manage'],
  });

  const session = await createSession({
    sessionId,
    userId: user.id,
    tenantId: payload.tenantId,
    accessToken: tokenPair.accessToken,
  });

  return {
    user,
    sessionId: session.sessionId,
    ...tokenPair,
  };
}

export async function logoutUser(authorizationHeader: string | undefined): Promise<void> {
  await revokeSession(authorizationHeader);
}
