/**
 * Tests — Auth validation schemas
 */
import { describe, it, expect } from 'vitest';
import {
  SignInSchema,
  SignUpSchema,
  RequestPasswordResetSchema,
  UpdatePasswordSchema,
  ResendConfirmationSchema,
} from '../schemas';

describe('SignInSchema', () => {
  it('accepts valid credentials', () => {
    const result = SignInSchema.safeParse({ email: 'user@example.com', password: 'pass123' });
    expect(result.success).toBe(true);
  });

  it('normalises email to lowercase', () => {
    const result = SignInSchema.safeParse({ email: 'USER@EXAMPLE.COM', password: 'pass' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('rejects invalid email', () => {
    const result = SignInSchema.safeParse({ email: 'not-an-email', password: 'pass' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = SignInSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('accepts optional redirectTo', () => {
    const result = SignInSchema.safeParse({
      email: 'a@b.com',
      password: 'pass',
      redirectTo: '/dashboard',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.redirectTo).toBe('/dashboard');
    }
  });
});

describe('SignUpSchema', () => {
  it('accepts valid signup data', () => {
    const result = SignUpSchema.safeParse({
      email: 'new@example.com',
      password: 'secure123',
      fullName: 'John Doe',
    });
    expect(result.success).toBe(true);
  });

  it('rejects password shorter than 8 chars', () => {
    const result = SignUpSchema.safeParse({
      email: 'a@b.com',
      password: 'short',
      fullName: 'John',
    });
    expect(result.success).toBe(false);
  });

  it('rejects fullName shorter than 2 chars', () => {
    const result = SignUpSchema.safeParse({
      email: 'a@b.com',
      password: 'password123',
      fullName: 'J',
    });
    expect(result.success).toBe(false);
  });
});

describe('RequestPasswordResetSchema', () => {
  it('accepts valid email', () => {
    const result = RequestPasswordResetSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = RequestPasswordResetSchema.safeParse({ email: 'bad' });
    expect(result.success).toBe(false);
  });
});

describe('UpdatePasswordSchema', () => {
  it('accepts matching passwords', () => {
    const result = UpdatePasswordSchema.safeParse({
      password: 'newpassword1',
      confirmPassword: 'newpassword1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = UpdatePasswordSchema.safeParse({
      password: 'newpassword1',
      confirmPassword: 'different1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('confirmPassword');
    }
  });

  it('rejects short password', () => {
    const result = UpdatePasswordSchema.safeParse({
      password: 'short',
      confirmPassword: 'short',
    });
    expect(result.success).toBe(false);
  });
});

describe('ResendConfirmationSchema', () => {
  it('accepts valid email', () => {
    const result = ResendConfirmationSchema.safeParse({ email: 'a@b.com' });
    expect(result.success).toBe(true);
  });
});
