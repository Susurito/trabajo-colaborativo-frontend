import { DASHBOARD_ALLOWED_ROLES, hasDashboardAccess, roleSlugToBackend } from './roles';

describe('Roles - Dashboard Access (HU-22/HU-23)', () => {
  it('should include coordinador, responsable_area and administrador in DASHBOARD_ALLOWED_ROLES', () => {
    expect(DASHBOARD_ALLOWED_ROLES).toContain('coordinador');
    expect(DASHBOARD_ALLOWED_ROLES).toContain('responsable_area');
    expect(DASHBOARD_ALLOWED_ROLES).toContain('administrador');
    expect(DASHBOARD_ALLOWED_ROLES.length).toBe(3);
  });

  it('should allow access to coordinador, responsable, and administrador', () => {
    expect(hasDashboardAccess('coordinador')).toBeTrue();
    expect(hasDashboardAccess('responsable')).toBeTrue();
    expect(hasDashboardAccess('administrador')).toBeTrue();
  });

  it('should deny access to unauthorized roles', () => {
    expect(hasDashboardAccess('reportante')).toBeFalse();
    expect(hasDashboardAccess('tecnico')).toBeFalse();
    expect(hasDashboardAccess('validador')).toBeFalse();
  });

  it('should deny access to null or undefined', () => {
    expect(hasDashboardAccess(null)).toBeFalse();
    expect(hasDashboardAccess(undefined)).toBeFalse();
  });

  it('should properly translate responsable to responsable_area', () => {
    expect(roleSlugToBackend('responsable')).toBe('responsable_area');
  });
});
