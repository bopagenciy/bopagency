import { ok, type Result, isPublishableGoogleAdsConfig, type PublishableGoogleAdsActivationConfig } from '@bop-agency/shared';
import type {
  ChannelPublisherPort,
  PublishInput,
  PublishReceipt,
  LoggerPort,
} from '@bop-agency/application';
import type {
  CampaignActivation,
  CampaignActivationTarget,
  CampaignActivationRepository,
  ClientRepository,
  GoogleAdsTargetResourceSnapshot,
} from '@bop-agency/domain';
import type { SupabaseCredentialRepository } from '../supabase/repositories/supabase-credential.repository';
import {
  GoogleAdsApiClient,
  GoogleAdsApiError,
  requireGoogleAdsApiVersion,
  requireGoogleAdsDeveloperToken,
  type GoogleMutateOperation,
} from './google-ads-api.client';

export type GoogleAdsPublisherAdapterDeps = {
  readonly activationRepository: CampaignActivationRepository;
  readonly clientRepository: ClientRepository;
  readonly credentialRepository: SupabaseCredentialRepository;
  readonly logger: LoggerPort;
  readonly apiClient?: GoogleAdsApiClient;
};

export function toGoogleBudgetMicros(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Budget amount must be a finite positive number, received: ${amount}`);
  }
  const micros = amount * 1_000_000;
  if (!Number.isSafeInteger(micros) || Math.abs(micros - Math.round(micros)) > 1e-9) {
    throw new Error(`Budget amount ${amount} cannot be represented as exact micros integer`);
  }
  return Math.round(micros);
}

export class GoogleAdsPublisherAdapter implements ChannelPublisherPort {
  private readonly activationRepository: CampaignActivationRepository;
  private readonly clientRepository: ClientRepository;
  private readonly credentialRepository: SupabaseCredentialRepository;
  private readonly logger: LoggerPort;
  private readonly apiClientSupplier: () => GoogleAdsApiClient;

  constructor(deps: GoogleAdsPublisherAdapterDeps) {
    this.activationRepository = deps.activationRepository;
    this.clientRepository = deps.clientRepository;
    this.credentialRepository = deps.credentialRepository;
    this.logger = deps.logger;

    if (deps.apiClient) {
      const fixedClient = deps.apiClient;
      this.apiClientSupplier = () => fixedClient;
    } else {
      this.apiClientSupplier = () =>
        new GoogleAdsApiClient(
          {
            developerToken: requireGoogleAdsDeveloperToken(),
            apiVersion: requireGoogleAdsApiVersion(),
          },
          this.logger,
        );
    }
  }

  supports(channel: string, provider: string): boolean {
    return channel === 'google_ads' && provider === 'google';
  }

  async publish(input: PublishInput): Promise<Result<PublishReceipt>> {
    this.logger.info('GoogleAdsPublisherAdapter: initiating publication', {
      jobId: input.jobId,
      targetId: input.targetId,
    });

    // 1. Pre-env check
    try {
      requireGoogleAdsApiVersion();
      requireGoogleAdsDeveloperToken();
    } catch (envErr) {
      this.logger.error('GoogleAdsPublisherAdapter: missing mandatory environment config', {
        error: envErr,
      });
      return ok({
        outcome: 'failed',
        failureCategory: 'CHANNEL_NOT_CONFIGURED',
        metadata: { message: envErr instanceof Error ? envErr.message : 'Missing Google Ads API environment configuration' },
      });
    }

    // 2. Load target & activation
    const targetResult = await this.activationRepository.findTargetById(
      input.targetId,
      input.organizationId,
    );
    if (!targetResult.success || !targetResult.value) {
      return ok({
        outcome: 'failed',
        failureCategory: 'ACTIVATION_NOT_READY',
        metadata: { message: `Target ${input.targetId} not found` },
      });
    }
    const target: CampaignActivationTarget = targetResult.value;

    const activationResult = await this.activationRepository.findById(
      target.activationId,
      input.organizationId,
    );
    if (!activationResult.success || !activationResult.value) {
      return ok({
        outcome: 'failed',
        failureCategory: 'ACTIVATION_NOT_READY',
        metadata: { message: `Activation ${target.activationId} not found` },
      });
    }
    const activation: CampaignActivation = activationResult.value;

    // 3. Preflight — Target Resource Snapshot
    const metadata = target.metadata as Record<string, unknown> | null;
    const targetResource = metadata?.['googleAdsTargetResource'] as GoogleAdsTargetResourceSnapshot | null;

    if (
      !targetResource ||
      !targetResource.clientIntegrationId ||
      !targetResource.customerId ||
      !/^\d{10}$/.test(targetResource.customerId) ||
      !targetResource.currencyCode ||
      targetResource.isManager !== false
    ) {
      return ok({
        outcome: 'failed',
        failureCategory: 'ACTIVATION_NOT_READY',
        metadata: { message: 'Google Ads target lacks valid immutable target resource snapshot; target re-preparation required' },
      });
    }

    // 4. Preflight — Compare target snapshot against current active client integration record
    const integrationsResult = await this.clientRepository.listIntegrations(
      activation.clientId,
      input.organizationId,
    );
    if (!integrationsResult.success) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INTEGRATION_NOT_AVAILABLE',
        metadata: { message: 'Client integration for Google Ads target not found or inaccessible' },
      });
    }

    const integration = integrationsResult.value.find(
      (i) => String(i.id) === String(targetResource.clientIntegrationId),
    );
    if (!integration) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INTEGRATION_NOT_AVAILABLE',
        metadata: { message: 'Client integration for Google Ads target not found or inaccessible' },
      });
    }

    if (integration.status !== 'active' || integration.provider !== 'google') {
      return ok({
        outcome: 'failed',
        failureCategory: 'INTEGRATION_NOT_AVAILABLE',
        metadata: { message: 'Client integration for Google Ads is not active' },
      });
    }

    const currentConfig = integration.configuration as Record<string, unknown> | null;
    const currentManagerId =
      typeof currentConfig?.['manager_customer_id'] === 'string' &&
      /^\d{10}$/.test(currentConfig['manager_customer_id'].trim())
        ? currentConfig['manager_customer_id'].trim()
        : null;

    if (
      integration.externalAccountId !== targetResource.customerId ||
      currentManagerId !== targetResource.managerCustomerId ||
      currentConfig?.['currency_code'] !== targetResource.currencyCode
    ) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INTEGRATION_NOT_AVAILABLE',
        metadata: { message: 'Integration target account binding changed after preparation; target re-preparation required' },
      });
    }

    // 5. Preflight — Approved Snapshot Google Ads Config
    const approvedConfigRaw = activation.approvedSnapshot?.googleAdsConfig;
    if (!isPublishableGoogleAdsConfig(approvedConfigRaw)) {
      return ok({
        outcome: 'failed',
        failureCategory: 'ACTIVATION_NOT_READY',
        metadata: { message: 'Approved snapshot lacks strict Google Ads configuration with EU political declaration' },
      });
    }
    const googleAdsConfig: PublishableGoogleAdsActivationConfig = approvedConfigRaw;

    // 6. Preflight — Account Currency Alignment
    if (googleAdsConfig.dailyBudget.currency !== targetResource.currencyCode) {
      return ok({
        outcome: 'failed',
        failureCategory: 'BUDGET_INVALID',
        metadata: { message: `Approved budget currency (${googleAdsConfig.dailyBudget.currency}) does not match target account currency (${targetResource.currencyCode})` },
      });
    }

    // 7. Preflight — Bidding Strategy MVP Support
    if (googleAdsConfig.biddingStrategy !== 'MAXIMIZE_CLICKS') {
      return ok({
        outcome: 'failed',
        failureCategory: 'ACTIVATION_NOT_READY',
        metadata: { message: 'Phase 8F.2 Search publisher MVP supports MAXIMIZE_CLICKS bidding strategy only; MANUAL_CPC requires explicit CPC bid authority' },
      });
    }

    // 8. Preflight — Approved Generated Content Single Ad Group & RSA bounds
    const generatedContent = activation.approvedSnapshot?.generatedContent;
    if (
      !generatedContent ||
      generatedContent.platform !== 'google_ads' ||
      !Array.isArray(generatedContent.adGroups) ||
      generatedContent.adGroups.length !== 1
    ) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INVALID_ASSET',
        metadata: { message: 'Phase 8F.2 Search publisher MVP supports single ad group content only' },
      });
    }
    const adGroupContent = generatedContent.adGroups[0]!;

    if (!Array.isArray(adGroupContent.headlines) || adGroupContent.headlines.length < 3 || adGroupContent.headlines.length > 15) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INVALID_ASSET',
        metadata: { message: 'Responsive Search Ad requires between 3 and 15 headlines' },
      });
    }

    if (!Array.isArray(adGroupContent.descriptions) || adGroupContent.descriptions.length < 2 || adGroupContent.descriptions.length > 4) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INVALID_ASSET',
        metadata: { message: 'Responsive Search Ad requires between 2 and 4 descriptions' },
      });
    }

    // Preflight Criteria Bounds Checks
    const positiveKeywords = Array.isArray(generatedContent.keywordSuggestions)
      ? generatedContent.keywordSuggestions
      : [];
    if (positiveKeywords.length > 50) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INVALID_ASSET',
        metadata: { message: 'Positive keyword suggestions exceed maximum preflight limit of 50' },
      });
    }

    const negativeKeywords = Array.isArray(generatedContent.negativeKeywordSuggestions)
      ? generatedContent.negativeKeywordSuggestions
      : [];
    if (negativeKeywords.length > 50) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INVALID_ASSET',
        metadata: { message: 'Negative keyword suggestions exceed maximum preflight limit of 50' },
      });
    }

    const geoIds = googleAdsConfig.geoTargetIds;
    if (geoIds.length > 50) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INVALID_ASSET',
        metadata: { message: 'Geo target constants exceed maximum preflight limit of 50' },
      });
    }

    const langIds = googleAdsConfig.languageCriterionIds;
    if (langIds.length > 10) {
      return ok({
        outcome: 'failed',
        failureCategory: 'INVALID_ASSET',
        metadata: { message: 'Language criterion constants exceed maximum preflight limit of 10' },
      });
    }

    // 9. Resolve Refresh Token & Refresh Access Token
    const refreshTokenResult = await this.credentialRepository.resolveGoogleRefreshToken(
      targetResource.clientIntegrationId,
    );
    if (!refreshTokenResult || !refreshTokenResult.refreshToken) {
      return ok({
        outcome: 'failed',
        failureCategory: 'AUTH_EXPIRED',
        metadata: { message: 'Google OAuth refresh token not available for client integration' },
      });
    }

    const apiClient = this.apiClientSupplier();
    let accessToken: string;
    try {
      const tokenResult = await apiClient.refreshAccessToken(refreshTokenResult.refreshToken);
      accessToken = tokenResult.accessToken;
    } catch (tokenErr) {
      this.logger.warn('GoogleAdsPublisherAdapter: token refresh failed', { error: tokenErr });
      return ok({
        outcome: 'failed',
        failureCategory: 'AUTH_EXPIRED',
        metadata: { message: tokenErr instanceof Error ? tokenErr.message : 'Failed to refresh Google OAuth access token' },
      });
    }

    // 10. Build Atomic Mutate Operations (lowerCamelCase REST JSON format)
    const jobShortId = input.jobId.replace(/-/g, '').substring(0, 8);
    const targetShortId = input.targetId.replace(/-/g, '').substring(0, 8);
    const correlationCampaignName = `BOP-${input.jobId}-${targetShortId}`.substring(0, 128);

    let budgetMicros: number;
    try {
      budgetMicros = toGoogleBudgetMicros(googleAdsConfig.dailyBudget.amount);
    } catch (bErr) {
      return ok({
        outcome: 'failed',
        failureCategory: 'BUDGET_INVALID',
        metadata: { message: bErr instanceof Error ? bErr.message : 'Invalid budget micros amount' },
      });
    }

    const mutateOperations: GoogleMutateOperation[] = [];

    // 1. Budget Operation (No status field on CampaignBudget)
    mutateOperations.push({
      campaignBudgetOperation: {
        create: {
          resourceName: `customers/${targetResource.customerId}/campaignBudgets/-1`,
          name: `BOP-BUDGET-${jobShortId}`,
          amountMicros: String(budgetMicros),
          explicitlyShared: false,
        },
      },
    });

    // 2. Campaign Operation
    mutateOperations.push({
      campaignOperation: {
        create: {
          resourceName: `customers/${targetResource.customerId}/campaigns/-2`,
          name: correlationCampaignName,
          status: 'PAUSED',
          advertisingChannelType: 'SEARCH',
          campaignBudget: `customers/${targetResource.customerId}/campaignBudgets/-1`,
          targetSpend: {},
          containsEuPoliticalAdvertising: googleAdsConfig.euPoliticalAdvertisingDeclaration,
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
        },
      },
    });

    // 3. AdGroup Operation
    const cleanAdGroupName = (adGroupContent.name || 'AG-1').replace(/[^\w\s-]/g, '').trim().substring(0, 100) || 'AG-1';
    mutateOperations.push({
      adGroupOperation: {
        create: {
          resourceName: `customers/${targetResource.customerId}/adGroups/-10`,
          campaign: `customers/${targetResource.customerId}/campaigns/-2`,
          name: cleanAdGroupName,
          status: 'PAUSED',
          type: 'SEARCH_STANDARD',
        },
      },
    });

    // 4. AdGroupAd Operation (RSA)
    const headlines = adGroupContent.headlines.map((text: string) => ({ text: text.trim().substring(0, 30) }));
    const descriptions = adGroupContent.descriptions.map((text: string) => ({ text: text.trim().substring(0, 90) }));

    mutateOperations.push({
      adGroupAdOperation: {
        create: {
          resourceName: `customers/${targetResource.customerId}/adGroupAds/-100`,
          adGroup: `customers/${targetResource.customerId}/adGroups/-10`,
          status: 'PAUSED',
          ad: {
            finalUrls: [googleAdsConfig.finalUrl],
            responsiveSearchAd: {
              headlines,
              descriptions,
            },
          },
        },
      },
    });

    // 5. Positive Keywords (AdGroupCriterion)
    for (const kwText of positiveKeywords) {
      if (kwText && kwText.trim().length > 0) {
        mutateOperations.push({
          adGroupCriterionOperation: {
            create: {
              adGroup: `customers/${targetResource.customerId}/adGroups/-10`,
              status: 'PAUSED',
              keyword: {
                text: kwText.trim().substring(0, 100),
                matchType: googleAdsConfig.keywordMatchPolicy,
              },
            },
          },
        });
      }
    }

    // 6. Negative Keywords (CampaignCriterion)
    for (const negText of negativeKeywords) {
      if (negText && negText.trim().length > 0) {
        mutateOperations.push({
          campaignCriterionOperation: {
            create: {
              campaign: `customers/${targetResource.customerId}/campaigns/-2`,
              negative: true,
              keyword: {
                text: negText.trim().substring(0, 100),
                matchType: googleAdsConfig.negativeKeywordMatchPolicy,
              },
            },
          },
        });
      }
    }

    // 7. Geo Location Criteria (CampaignCriterion)
    for (const geoId of geoIds) {
      mutateOperations.push({
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${targetResource.customerId}/campaigns/-2`,
            negative: false,
            location: {
              geoTargetConstant: `geoTargetConstants/${geoId}`,
            },
          },
        },
      });
    }

    // 8. Language Criteria (CampaignCriterion)
    for (const langId of langIds) {
      mutateOperations.push({
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${targetResource.customerId}/campaigns/-2`,
            negative: false,
            language: {
              languageConstant: `languageConstants/${langId}`,
            },
          },
        },
      });
    }

    // 11. Execute Atomic Mutate Request
    try {
      const result = await apiClient.mutate({
        customerId: targetResource.customerId,
        managerCustomerId: targetResource.managerCustomerId,
        accessToken,
        payload: {
          mutateOperations,
          partialFailure: false,
          validateOnly: false,
          responseContentType: 'RESOURCE_NAME_ONLY',
        },
      });

      const mutateResponses = result.response.mutateOperationResponses || [];
      const campaignRes = mutateResponses.find((r) => r.campaignResult?.resourceName);
      const campaignResourceName = campaignRes?.campaignResult?.resourceName;

      // Extract numeric campaignId from resourceName "customers/1234567890/campaigns/9876543210"
      const extractedCampaignId = campaignResourceName?.split('/').pop() || 'unknown';
      const externalId = `customers/${targetResource.customerId}/campaigns/${extractedCampaignId}`;

      const receipt: PublishReceipt = {
        outcome: 'succeeded',
        externalId,
        externalUrl: null,
        metadata: {
          requestId: result.requestId,
          campaignResourceName: campaignResourceName || null,
          campaignId: extractedCampaignId,
          correlationName: correlationCampaignName,
        },
      };

      this.logger.info('GoogleAdsPublisherAdapter: atomic mutate succeeded', {
        jobId: input.jobId,
        externalId,
        requestId: result.requestId,
      });

      return ok(receipt);
    } catch (mutateErr) {
      this.logger.warn('GoogleAdsPublisherAdapter: atomic mutate call failed', { error: mutateErr });

      if (mutateErr instanceof GoogleAdsApiError) {
        if (mutateErr.statusCode === 401 || mutateErr.statusCode === 403) {
          const msg = mutateErr.message.toLowerCase();
          if (msg.includes('developer-token') || msg.includes('access denied')) {
            return ok({
              outcome: 'failed',
              failureCategory: 'INTEGRATION_NOT_AVAILABLE',
              metadata: { message: mutateErr.message },
            });
          }
          return ok({
            outcome: 'failed',
            failureCategory: 'AUTH_EXPIRED',
            metadata: { message: mutateErr.message },
          });
        }

        if (mutateErr.statusCode === 429) {
          return ok({
            outcome: 'failed',
            failureCategory: 'RATE_LIMITED',
            metadata: { message: mutateErr.message },
          });
        }

        if (mutateErr.statusCode === 400) {
          return ok({
            outcome: 'failed',
            failureCategory: 'PROVIDER_REJECTED',
            metadata: { message: mutateErr.message },
          });
        }
      }

      // 5xx / Network ambiguous post-submit -> unknown_outcome with essential metadata preserved for sweeper reconciliation
      return ok({
        outcome: 'unknown_outcome',
        metadata: {
          correlationName: correlationCampaignName,
          customerId: targetResource.customerId,
          managerCustomerId: targetResource.managerCustomerId,
          requestId: mutateErr instanceof GoogleAdsApiError ? mutateErr.requestId : null,
          message: mutateErr instanceof Error ? mutateErr.message : 'Google Ads API request failed with unknown outcome',
        },
      });
    }
  }
}
