'use strict';

const { z } = require('zod');

const { password } = require('./common');

const operatorLoginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required.' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  password: z
    .string({ required_error: 'Password is required.' })
    .min(1, 'Password is required.'),
});

const activateSchema = z.object({
  token: z
    .string({ required_error: 'This link is missing its code.' })
    .min(20, 'This link is not valid. Ask the agency for a new one.'),
  password,
});

const changePasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: 'Enter your current password.' })
    .min(1, 'Enter your current password.'),
  newPassword: password,
});

module.exports = { operatorLoginSchema, activateSchema, changePasswordSchema };
