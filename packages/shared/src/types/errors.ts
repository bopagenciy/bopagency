export type ErrorCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'CANCEL_NOT_SUPPORTED';

export type AppError = {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
};

export function createError(code: ErrorCode, message: string, details?: unknown): AppError {
  return { code, message, details };
}

export function notFound(resource: string): AppError {
  return createError('NOT_FOUND', `${resource} no encontrado.`);
}

export function validationError(message: string, details?: unknown): AppError {
  return createError('VALIDATION_ERROR', message, details);
}

export function notImplemented(feature: string): AppError {
  return createError('NOT_IMPLEMENTED', `${feature} no está implementado aún.`);
}
