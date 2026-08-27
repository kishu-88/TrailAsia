'use strict';

const { z } = require('zod');
const { atLeastOneField, password } = require('./common');

const ROLES = ['consultant', 'coordinator', 'finance', 'admin'];

const createUserSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(100),
  lastName: z.string().trim().min(1, 'Last name is required.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password,
  role: z.enum(ROLES, { errorMap: () => ({ message: `Role must be one of: ${ROLES.join(', ')}.` }) }),
});

const updateUserSchema = atLeastOneField(
  z
    .object({
      firstName: z.string().trim().min(1).max(100).optional(),
      lastName: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().toLowerCase().email('Enter a valid email address.').optional(),
      role: z.enum(ROLES).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
);

const resetPasswordSchema = z.object({ password });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: password,
});

module.exports = {
  ROLES,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
