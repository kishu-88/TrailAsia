'use strict';

const { z } = require('zod');
const { atLeastOneField, countryCode, currencyCode } = require('./common');

const DOCUMENT_TYPES = [
  'passport',
  'visa',
  'insurance',
  'health_declaration',
  'permit',
  'vaccination',
  'other',
];

const createDestinationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Use at least two characters.')
    .max(10)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, hyphen and underscore only.')
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, 'Name is required.').max(120),
  countryCode: countryCode.nullish(),
  region: z.string().trim().max(60).nullish(),
  currencyCode: currencyCode.default('AUD'),
  maxAltitudeMetres: z.number().int().min(0).max(9000).nullish(),
  advisoryNotes: z.string().max(5000).nullish(),
  isActive: z.boolean().default(true),
});

const updateDestinationSchema = atLeastOneField(
  z
    .object({
      code: z
        .string()
        .trim()
        .min(2)
        .max(10)
        .regex(/^[A-Za-z0-9_-]+$/)
        .transform((value) => value.toUpperCase())
        .optional(),
      name: z.string().trim().min(1).max(120).optional(),
      countryCode: countryCode.nullish(),
      region: z.string().trim().max(60).nullish(),
      currencyCode: currencyCode.optional(),
      maxAltitudeMetres: z.number().int().min(0).max(9000).nullish(),
      advisoryNotes: z.string().max(5000).nullish(),
      isActive: z.boolean().optional(),
    })
    .strict()
);

const createRequirementSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  name: z.string().trim().min(1, 'Name is required.').max(160),
  description: z.string().max(5000).nullish(),
  isMandatory: z.boolean().default(true),
  leadTimeDays: z.number().int().min(0).max(365).default(14),
  minValidityMonths: z.number().int().min(0).max(120).nullish(),
  requiresAltitudeCover: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const updateRequirementSchema = atLeastOneField(
  z
    .object({
      type: z.enum(DOCUMENT_TYPES).optional(),
      name: z.string().trim().min(1).max(160).optional(),
      description: z.string().max(5000).nullish(),
      isMandatory: z.boolean().optional(),
      leadTimeDays: z.number().int().min(0).max(365).optional(),
      minValidityMonths: z.number().int().min(0).max(120).nullish(),
      requiresAltitudeCover: z.boolean().optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
);

module.exports = {
  DOCUMENT_TYPES,
  createDestinationSchema,
  updateDestinationSchema,
  createRequirementSchema,
  updateRequirementSchema,
};
