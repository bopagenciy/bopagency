/**
 * Result<T, E> — Pattern funcional para manejo de errores sin excepciones.
 * Fase 1: implementación base.
 */

export type Ok<T> = { readonly success: true; readonly value: T };
export type Err<E> = { readonly success: false; readonly error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { success: true, value };
}

export function err<E>(error: E): Err<E> {
  return { success: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.success === true;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.success === false;
}

export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (isOk(result)) return ok(fn(result.value));
  return result;
}

// Circular reference avoidance: import AppError inline
import type { AppError } from './errors';
