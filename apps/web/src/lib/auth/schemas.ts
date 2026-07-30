/**
 * Schemas Zod para validación de datos de autenticación.
 */
import { z } from 'zod';

export const SignInSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(1, 'La contraseña es requerida'),
  redirectTo: z.string().optional(),
});

export const SignUpSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').trim(),
});

export const RequestPasswordResetSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
});

export const UpdatePasswordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });

export const ResendConfirmationSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
});

export type SignInInput = z.infer<typeof SignInSchema>;
export type SignUpInput = z.infer<typeof SignUpSchema>;
export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetSchema>;
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>;
export type ResendConfirmationInput = z.infer<typeof ResendConfirmationSchema>;
