/**
 * Phase 4 Migration — Secret detector for JSON source files
 *
 * SECURITY:
 * - Scans JSON values (strings only) for patterns that look like secrets.
 * - If a secret-like value is found, the ENTIRE file is excluded.
 * - The detected value is NEVER logged; only field name and file path are.
 * - Only applies to JSON configuration files, NOT to Markdown content.
 */

const SENSITIVE_FIELD_RE =
  /^(token|secret|password|key|credential|apiKey|api_key|accessToken|access_token|refreshToken|refresh_token|clientSecret|client_secret)$/i;

const SECRET_PATTERNS: RegExp[] = [
  /^Bearer\s+[A-Za-z0-9+/=]{20,}$/, // Bearer tokens
  /^EAA[a-zA-Z0-9]{50,}$/, // Meta/Facebook tokens
  /^sk-[a-zA-Z0-9]{20,}$/, // OpenAI keys
  /^xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+$/, // Slack bot tokens
  /^xoxp-[0-9]+-[0-9]+-[0-9]+-[a-zA-Z0-9]+$/, // Slack user tokens
  /^ghp_[A-Za-z0-9]{36,}$/, // GitHub personal access tokens
  /^[A-Za-z0-9+/]{40,}={0,2}$/, // Generic long base64 (>40 chars)
];

export interface SecretDetectionResult {
  hasSecrets: boolean;
  detectedFields: string[]; // field names only — values are NEVER included
}

function looksLikeSecret(value: string): boolean {
  if (value.length < 20) return false;
  return SECRET_PATTERNS.some((re) => re.test(value));
}

function scanValue(key: string, value: unknown, detectedFields: string[]): void {
  if (typeof value === 'string') {
    if (SENSITIVE_FIELD_RE.test(key) && value.length > 0) {
      detectedFields.push(key);
      return;
    }
    if (looksLikeSecret(value)) {
      detectedFields.push(key);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => scanValue(String(i), item, detectedFields));
    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      scanValue(k, v, detectedFields);
    }
  }
}

/**
 * Scans a parsed JSON object for secret-like values.
 * Returns field names that triggered detection (never the values).
 */
export function detectSecrets(data: unknown): SecretDetectionResult {
  const detectedFields: string[] = [];
  scanValue('root', data, detectedFields);
  return {
    hasSecrets: detectedFields.length > 0,
    detectedFields: [...new Set(detectedFields)], // deduplicate
  };
}
