import type { Result } from '@bop-agency/shared';

export type StorageObject = {
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
  readonly lastModified: Date;
};

export type UploadOptions = {
  readonly key: string;
  readonly content: Uint8Array;
  readonly contentType: string;
  readonly metadata?: Record<string, string>;
};

/** Object storage port — S3/R2 adapter in Fase 2+. */
export interface StorageProvider {
  upload(options: UploadOptions): Promise<Result<StorageObject>>;
  getUrl(key: string, expiresInSeconds?: number): Promise<Result<string>>;
  delete(key: string): Promise<Result<void>>;
  list(prefix: string): Promise<Result<readonly StorageObject[]>>;
}
