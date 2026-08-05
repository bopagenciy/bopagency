// Mock for 'server-only' package in test environments.
// In production, Next.js provides this package to prevent server modules
// from being imported into client bundles. In tests (node/jsdom), we
// substitute it with an empty module so server-side code can be tested.
export {};
