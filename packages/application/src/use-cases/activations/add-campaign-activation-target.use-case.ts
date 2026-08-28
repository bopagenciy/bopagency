import { ok, err, isOk, CAMPAIGN_CURRENCIES, type Currency } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import { addCampaignActivationTargetSchema } from '@bop-agency/shared';
import type {
  CampaignActivationTarget,
  CampaignActivationId,
  CampaignActivationRepository,
  ClientIntegrationId,
  ClientRepository,
  GoogleAdsTargetResourceSnapshot,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import {
  hasMinimumRole,
  insufficientRole,
  notOrganizationMember,
  isActivationStatusTerminal,
  activationInvalidStatus,
  validateCreateActivationTargetInput,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type AddCampaignActivationTargetInput = {
  readonly activationId: string;
  readonly channel: string;
  readonly provider: string;
  readonly placement?: string | null;
  readonly clientIntegrationId?: string | null;
  readonly metadata?: Record<string, unknown>;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type AddCampaignActivationTargetDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function addCampaignActivationTarget(
  input: AddCampaignActivationTargetInput,
  deps: AddCampaignActivationTargetDeps,
): Promise<Result<CampaignActivationTarget>> {
  deps.logger.debug('addCampaignActivationTarget', {
    activationId: input.activationId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = addCampaignActivationTargetSchema.safeParse({
    activationId: input.activationId,
    channel: input.channel,
    provider: input.provider,
    placement: input.placement,
    clientIntegrationId: input.clientIntegrationId,
    metadata: input.metadata,
  });
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }
  if (!hasMinimumRole(memberResult.value.role, 'strategist')) {
    return err(insufficientRole('strategist', memberResult.value.role));
  }

  const activationResult = await deps.activationRepository.findById(
    parsed.data.activationId as CampaignActivationId,
    input.organizationId,
  );
  if (!isOk(activationResult)) {
    return activationResult;
  }
  const activation = activationResult.value;

  if (isActivationStatusTerminal(activation.status)) {
    return err(activationInvalidStatus(activation.status, 'preparing'));
  }

  const clientIntegrationId = (parsed.data.clientIntegrationId ?? null) as ClientIntegrationId | null;

  const validationError = validateCreateActivationTargetInput({
    channel: parsed.data.channel,
    provider: parsed.data.provider,
    clientIntegrationId,
  });
  if (validationError) {
    return err({ code: 'VALIDATION_ERROR' as const, message: validationError });
  }

  // ── Congelar snapshot inmutable de recurso para Google Ads ────────────────
  const targetMetadata = { ...(parsed.data.metadata ?? {}) };

  if (parsed.data.channel === 'google_ads' && parsed.data.provider === 'google') {
    if (!clientIntegrationId) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'Google Ads target requires clientIntegrationId',
      });
    }

    const integrationsResult = await deps.clientRepository.listIntegrations(
      activation.clientId,
      input.organizationId,
    );
    if (!isOk(integrationsResult)) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'Failed to resolve client integrations for Google Ads target',
      });
    }

    const integration = integrationsResult.value.find((i) => String(i.id) === String(clientIntegrationId));
    if (!integration) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'Client integration specified for Google Ads target not found',
      });
    }

    if (integration.provider !== 'google' || integration.status !== 'active') {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'Client integration specified for Google Ads target is not active for provider google',
      });
    }

    const customerId = integration.externalAccountId;
    if (!customerId || !/^\d{10}$/.test(customerId)) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'Google Ads integration externalAccountId must be a 10-digit numeric customer ID',
      });
    }

    const config = integration.configuration as Record<string, unknown> | null;
    const managerCustomerIdRaw = config?.['manager_customer_id'];
    const managerCustomerId =
      typeof managerCustomerIdRaw === 'string' && /^\d{10}$/.test(managerCustomerIdRaw.trim())
        ? managerCustomerIdRaw.trim()
        : null;

    const currencyCodeRaw = config?.['currency_code'];
    if (
      typeof currencyCodeRaw !== 'string' ||
      !(CAMPAIGN_CURRENCIES as readonly string[]).includes(currencyCodeRaw)
    ) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'Google Ads integration configuration missing valid currency code',
      });
    }
    const currencyCode = currencyCodeRaw as Currency;

    if (config?.['is_manager'] === true) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'Google Ads target cannot be created directly for a manager (MCC) account',
      });
    }

    const googleResourceSnapshot: GoogleAdsTargetResourceSnapshot = {
      clientIntegrationId: String(clientIntegrationId),
      customerId,
      managerCustomerId,
      currencyCode,
      isManager: false,
    };

    targetMetadata['googleAdsTargetResource'] = googleResourceSnapshot;
  }

  const result = await deps.activationRepository.addTarget({
    activationId: activation.id,
    organizationId: input.organizationId,
    clientId: activation.clientId,
    channel: parsed.data.channel,
    provider: parsed.data.provider,
    placement: parsed.data.placement ?? null,
    clientIntegrationId,
    metadata: targetMetadata,
  });
  if (!isOk(result)) {
    deps.logger.error('addCampaignActivationTarget: repository error', { error: result });
    return result;
  }

  deps.logger.info('addCampaignActivationTarget: ok', {
    targetId: String(result.value.id),
    activationId: String(activation.id),
    organizationId: input.organizationId,
  });

  return ok(result.value);
}
