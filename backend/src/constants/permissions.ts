// ============================================
// RBAC Permission Constants
// ============================================

export const MODULES = [
  'dashboard',
  'frameworks',
  'assets',
  'risks',
  'policies',
  'soa',
  'incidents',
  'changes',
  'exemptions',
  'assessments',
  'infrastructure',
  'audit_log',
  'users',
  'settings',
] as const;

export type Module = (typeof MODULES)[number];

export const ACTIONS = ['view', 'edit', 'approve'] as const;
export type Action = (typeof ACTIONS)[number];

// Which actions each module supports
export const MODULE_ACTIONS: Record<Module, readonly Action[]> = {
  dashboard:   ['view'],
  frameworks:  ['view', 'edit'],
  assets:      ['view', 'edit'],
  risks:       ['view', 'edit', 'approve'],
  policies:    ['view', 'edit'],
  soa:         ['view', 'edit', 'approve'],
  incidents:   ['view', 'edit'],
  changes:     ['view', 'edit'],
  exemptions:  ['view', 'edit', 'approve'],
  assessments:     ['view', 'edit', 'approve'],
  infrastructure:  ['view', 'edit'],
  audit_log:       ['view'],
  users:       ['view', 'edit'],
  settings:    ['view', 'edit'],
};

export type Permission = `${Module}:${Action}`;

// All valid permission strings
export const ALL_PERMISSIONS: Permission[] = Object.entries(MODULE_ACTIONS)
  .flatMap(([mod, actions]) => (actions as readonly Action[]).map(a => `${mod}:${a}` as Permission));

// Map legacy Role enum values to permission sets
export function getLegacyPermissions(role: string): Permission[] {
  const allView = MODULES.map(m => `${m}:view` as Permission);

  switch (role) {
    case 'ADMIN':
    case 'LOCAL_ADMIN':
      return [...ALL_PERMISSIONS];

    case 'AUDITOR':
      return [
        ...allView,
        'soa:approve' as Permission,
        'risks:approve' as Permission,
        'assessments:edit' as Permission,
        'assessments:approve' as Permission,
      ];

    case 'USER':
      return [
        ...allView,
        'risks:edit' as Permission,
        'soa:edit' as Permission,
        'frameworks:edit' as Permission,
        'policies:edit' as Permission,
        'incidents:edit' as Permission,
        'changes:edit' as Permission,
        'assets:edit' as Permission,
        'exemptions:edit' as Permission,
        'assessments:edit' as Permission,
        'infrastructure:edit' as Permission,
      ];

    case 'VIEWER':
      return [...allView];

    default:
      return [];
  }
}

// Human-readable module labels for the UI
export const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Dashboard',
  frameworks: 'Frameworks',
  assets: 'Assets',
  risks: 'Risks',
  policies: 'Policies',
  soa: 'Statement of Applicability',
  incidents: 'Incidents',
  changes: 'Changes',
  exemptions: 'Exemptions',
  assessments: 'Assessments',
  infrastructure: 'Infrastructure',
  audit_log: 'Audit Log',
  users: 'Users',
  settings: 'Settings',
};

// Default system role definitions (used when seeding)
export const SYSTEM_ROLES = [
  {
    name: 'Super Admin',
    description: 'Full access to all modules and actions',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Local Admin',
    description: 'Full access to all modules within the organization',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Auditor',
    description: 'View access to all modules plus approval capabilities',
    permissions: getLegacyPermissions('AUDITOR'),
  },
  {
    name: 'Standard User',
    description: 'View and edit access to most modules',
    permissions: getLegacyPermissions('USER'),
  },
  {
    name: 'Viewer',
    description: 'Read-only access to all modules',
    permissions: getLegacyPermissions('VIEWER'),
  },
] as const;

// Map legacy enum to system role name
export const LEGACY_ROLE_TO_SYSTEM_NAME: Record<string, string> = {
  ADMIN: 'Super Admin',
  LOCAL_ADMIN: 'Local Admin',
  AUDITOR: 'Auditor',
  USER: 'Standard User',
  VIEWER: 'Viewer',
};
