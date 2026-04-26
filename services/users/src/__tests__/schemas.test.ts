import { describe, expect, it } from 'vitest';

import { createLocationSchema } from '../schemas/location.schema.js';
import { createRoleSchema } from '../schemas/role.schema.js';
import { createTenantSchema } from '../schemas/tenant.schema.js';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema.js';

describe('users service schemas', () => {
  it('accepts a valid user payload', () => {
    const payload = createUserSchema.parse({
      email: 'doctor@example.com',
      fullName: 'Dr. Ada Lovelace',
      status: 'ACTIVE',
    });
    expect(payload.email).toBe('doctor@example.com');
  });

  it('rejects empty update payload', () => {
    expect(() => updateUserSchema.parse({})).toThrow('At least one field must be provided.');
  });

  it('applies defaults for tenant payload', () => {
    const payload = createTenantSchema.parse({
      name: 'Smile Clinic',
      type: 'SOLO_PRACTICE',
    });
    expect(payload.defaultLocale).toBe('en-US');
  });

  it('validates required tenant id for locations', () => {
    expect(() =>
      createLocationSchema.parse({
        name: 'Main Branch',
      })
    ).toThrow();
  });

  it('supports role payload with permission keys', () => {
    const payload = createRoleSchema.parse({
      tenantId: '11111111-1111-4111-8111-111111111111',
      name: 'Manager',
      permissionKeys: ['users.read', 'users.write'],
    });
    expect(payload.permissionKeys).toHaveLength(2);
  });
});
