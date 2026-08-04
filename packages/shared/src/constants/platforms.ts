export const AD_PLATFORMS = [
  'meta_ads',
  'google_ads',
  'youtube_ads',
  'tiktok_ads',
  'linkedin_ads',
  'twitter_ads',
  'snapchat_ads',
  'pinterest_ads',
  'amazon_ads',
  'microsoft_ads',
  'spotify_ads',
  'apple_ads',
  'ga4',
  'shopify',
] as const;

export type AdPlatform = (typeof AD_PLATFORMS)[number];

// ─── Metric platform (DB CHECK constraint) ────────────────────────────────────
// Distinct from AdPlatform: these are the values accepted by client_metrics.platform
// and alerts.platform in Supabase. See migration 20260730150000_phase4_data_migration_targets.sql.
export const METRIC_PLATFORMS = [
  'meta',
  'google',
  'tiktok',
  'linkedin',
  'twitter',
  'other',
] as const;

export type MetricPlatform = (typeof METRIC_PLATFORMS)[number];

export const METRIC_PLATFORM_LABELS: Record<MetricPlatform, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
  twitter: 'X Ads',
  other: 'Other',
};

// ─── AdPlatform labels (existing) ────────────────────────────────────────────
export const PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  youtube_ads: 'YouTube Ads',
  tiktok_ads: 'TikTok Ads',
  linkedin_ads: 'LinkedIn Ads',
  twitter_ads: 'X Ads',
  snapchat_ads: 'Snapchat Ads',
  pinterest_ads: 'Pinterest Ads',
  amazon_ads: 'Amazon Ads',
  microsoft_ads: 'Microsoft Ads',
  spotify_ads: 'Spotify Ads',
  apple_ads: 'Apple Ads',
  ga4: 'Google Analytics 4',
  shopify: 'Shopify',
};
