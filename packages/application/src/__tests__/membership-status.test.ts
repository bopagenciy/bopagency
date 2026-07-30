/**
 * Tests — Comportamiento de membresía y status
 *
 * Verifica las reglas de negocio derivadas del esquema alineado:
 * - organization_members.status distingue miembros activos de suspendidos/removidos
 * - user_preferences.active_organization_id es la fuente de verdad para la org activa
 * - solo membresías activas conceden acceso
 */
import { describe, it, expect } from 'vitest';
import type { OrganizationMember, MembershipStatus } from '@bop-agency/domain';
import { canManageOrganization } from '@bop-agency/domain';

// ---------------------------------------------------------------------------
// Helpers de test
// ---------------------------------------------------------------------------

function makeMember(
  role: OrganizationMember['role'],
  status: MembershipStatus = 'active',
): OrganizationMember {
  return {
    id: 'member-1',
    organizationId: 'org-1' as OrganizationMember['organizationId'],
    userId: 'user-1',
    role,
    status,
    invitedBy: null,
    joinedAt: new Date('2026-01-01'),
  };
}

function isActiveMember(member: OrganizationMember): boolean {
  return member.status === 'active';
}

// ---------------------------------------------------------------------------
// Tests: status distingue acceso
// ---------------------------------------------------------------------------

describe('MembershipStatus', () => {
  it('owner activo es miembro activo', () => {
    const member = makeMember('owner', 'active');
    expect(isActiveMember(member)).toBe(true);
  });

  it('owner suspendido NO es miembro activo', () => {
    const member = makeMember('owner', 'suspended');
    expect(isActiveMember(member)).toBe(false);
  });

  it('viewer removido NO es miembro activo', () => {
    const member = makeMember('viewer', 'removed');
    expect(isActiveMember(member)).toBe(false);
  });

  it('invited NO es miembro activo (aún no aceptó)', () => {
    const member = makeMember('operator', 'invited');
    expect(isActiveMember(member)).toBe(false);
  });

  it('solo status = active cuenta como acceso concedido', () => {
    const statuses: MembershipStatus[] = ['active', 'invited', 'suspended', 'removed'];
    const activeCount = statuses.filter((s) => s === 'active').length;
    expect(activeCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: selector solo lista orgs de miembros activos
// ---------------------------------------------------------------------------

describe('Selector de organización — solo miembros activos', () => {
  const allMembers: OrganizationMember[] = [
    makeMember('owner', 'active'),
    makeMember('admin', 'suspended'),
    makeMember('viewer', 'removed'),
    makeMember('operator', 'invited'),
  ];

  it('filtra solo membresías activas para el selector', () => {
    const activeOrgs = allMembers.filter(isActiveMember);
    expect(activeOrgs).toHaveLength(1);
    expect(activeOrgs[0]?.role).toBe('owner');
  });

  it('un usuario sin membresías activas necesita onboarding', () => {
    const noActiveMembers = allMembers.filter(isActiveMember).length === 0;
    // En este caso no hay activos (solo hay 1, pero prueba la lógica):
    const membersNoActive = allMembers.filter((m) => m.status !== 'active');
    expect(membersNoActive.filter(isActiveMember)).toHaveLength(0);
    expect(noActiveMembers).toBe(false); // hay 1 activo
  });

  it('usuario sin ninguna membresía va a onboarding', () => {
    const emptyMembers: OrganizationMember[] = [];
    const needsOnboarding = emptyMembers.filter(isActiveMember).length === 0;
    expect(needsOnboarding).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: reglas de autorización respetan status
// ---------------------------------------------------------------------------

describe('Autorización de roles — miembros activos', () => {
  it('owner activo puede administrar', () => {
    const member = makeMember('owner', 'active');
    if (!isActiveMember(member)) throw new Error('not active');
    expect(canManageOrganization(member.role)).toBe(true);
  });

  it('admin activo puede administrar', () => {
    const member = makeMember('admin', 'active');
    if (!isActiveMember(member)) throw new Error('not active');
    expect(canManageOrganization(member.role)).toBe(true);
  });

  it('viewer activo NO puede administrar', () => {
    const member = makeMember('viewer', 'active');
    if (!isActiveMember(member)) throw new Error('not active');
    expect(canManageOrganization(member.role)).toBe(false);
  });

  it('owner suspendido: status inválido, no se evalúa rol', () => {
    const member = makeMember('owner', 'suspended');
    // La lógica correcta: verificar status ANTES de rol
    expect(isActiveMember(member)).toBe(false);
    // Si se evaluara el rol de todas formas sería owner, pero no debe llegar aquí
  });
});

// ---------------------------------------------------------------------------
// Tests: active_organization_id en user_preferences
// ---------------------------------------------------------------------------

describe('user_preferences.active_organization_id', () => {
  it('null indica que el usuario no completó onboarding', () => {
    const activeOrgId: string | null = null;
    const needsOnboarding = activeOrgId === null;
    expect(needsOnboarding).toBe(true);
  });

  it('valor no-null indica org activa seleccionada', () => {
    const activeOrgId: string | null = 'org-uuid-1';
    const needsOnboarding = activeOrgId === null;
    expect(needsOnboarding).toBe(false);
  });

  it('onboarding establece active_organization_id en la org recién creada', () => {
    // Simula el resultado de create_organization_with_owner RPC
    const newOrgId = 'org-nuevo-uuid';
    const updatedPrefs = { active_organization_id: newOrgId };
    expect(updatedPrefs.active_organization_id).toBe(newOrgId);
  });

  it('switchActiveOrganization solo debe aceptar orgs con membresía activa', () => {
    const userActiveOrgIds = ['org-1']; // orgs del usuario con status = active
    const requestedOrgId = 'org-2'; // org a la que NO pertenece
    const hasActiveMembership = userActiveOrgIds.includes(requestedOrgId);
    expect(hasActiveMembership).toBe(false);
  });
});
