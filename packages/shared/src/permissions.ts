/**
 * Role-based access control. This file is the single source of truth: the API
 * guards read it directly and the database `roles` table is seeded from it so
 * the policy is visible in SQL as well.
 */
export const PERMISSIONS = [
  'city:read',
  'project:read',
  'project:create',
  'project:manage',
  'scenario:read',
  'scenario:write',
  'run:execute',
  'run:control',
  'report:write',
  'audit:read',
  'user:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type UserRole = 'admin' | 'planner' | 'viewer';
export type MemberRole = 'owner' | 'editor' | 'viewer';

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  planner: [
    'city:read',
    'project:read',
    'project:create',
    'project:manage',
    'scenario:read',
    'scenario:write',
    'run:execute',
    'run:control',
    'report:write',
  ],
  viewer: ['city:read', 'project:read', 'scenario:read'],
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access, including user management and audit logs.',
  planner: 'Creates projects and scenarios, runs simulations, writes reports.',
  viewer: 'Read-only access to cities, projects and results shared with them.',
};

/** What a project membership role allows inside that project. */
export const MEMBER_CAPABILITIES: Record<MemberRole, { read: boolean; write: boolean; manage: boolean }> = {
  owner: { read: true, write: true, manage: true },
  editor: { read: true, write: true, manage: false },
  viewer: { read: true, write: false, manage: false },
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
