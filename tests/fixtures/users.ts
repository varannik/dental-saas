// Test user fixtures

export const testUsers = {
  admin: {
    id: 'user_admin_001',
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    name: 'Admin User',
    role: 'admin',
  },
  user: {
    id: 'user_standard_001',
    email: 'user@example.com',
    password: 'UserPassword123!',
    name: 'Standard User',
    role: 'user',
  },
  member: {
    id: 'user_member_001',
    email: 'member@example.com',
    password: 'MemberPassword123!',
    name: 'Team Member',
    role: 'member',
  },
};

export const testSubscriptions = {
  active: {
    id: 'sub_001',
    userId: testUsers.user.id,
    planId: 'plan_pro',
    status: 'active',
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  cancelled: {
    id: 'sub_002',
    userId: testUsers.member.id,
    planId: 'plan_basic',
    status: 'cancelled',
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
};

