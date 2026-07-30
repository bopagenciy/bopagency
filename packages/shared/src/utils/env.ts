type RuntimeGlobal = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

function getProcessEnvironment(): Record<string, string | undefined> {
  const runtimeGlobal = globalThis as RuntimeGlobal;

  return runtimeGlobal.process?.env ?? {};
}

export function getEnvVar(key: string): string {
  const value = getProcessEnvironment()[key];

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getOptionalEnvVar(key: string): string | undefined {
  return getProcessEnvironment()[key];
}

function getNodeEnv(): string {
  return getOptionalEnvVar('NODE_ENV') ?? 'development';
}

export function isDevelopment(): boolean {
  return getNodeEnv() === 'development';
}

export function isProduction(): boolean {
  return getNodeEnv() === 'production';
}

export function isTest(): boolean {
  return getNodeEnv() === 'test';
}
