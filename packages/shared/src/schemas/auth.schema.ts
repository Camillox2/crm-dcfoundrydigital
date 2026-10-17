import { z } from 'zod';
import { RoleSchema } from '../rbac.js';

export const LoginInputSchema = z.object({
  email: z.string().email('Informe um e-mail corporativo válido.'),
  password: z.string().min(8, 'A senha deve possuir no mínimo 8 caracteres.'),
  totpCode: z
    .string()
    .regex(/^\d{6}$/, 'O código 2FA (TOTP) deve conter 6 dígitos.')
    .optional(),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const AuthUserPayloadSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  teamId: z.string().uuid().nullable().optional(),
  roles: z.array(RoleSchema).min(1),
  totpEnabled: z.boolean(),
});

export type AuthUserPayload = z.infer<typeof AuthUserPayloadSchema>;
