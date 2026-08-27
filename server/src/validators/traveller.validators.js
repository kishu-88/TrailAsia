'use strict';

const { z } = require('zod');
const { atLeastOneField, countryCode, dateOnly, idLike } = require('./common');

const DOCUMENT_TYPES = [
  'passport',
  'visa',
  'insurance',
  'health_declaration',
  'permit',
  'vaccination',
  'other',
];

const createTravellerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(100),
  lastName: z.string().trim().min(1, 'Last name is required.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').nullish(),
  phone: z.string().trim().max(40).nullish(),
  dateOfBirth: dateOnly.nullish(),
  nationality: countryCode.nullish(),
  passportNumber: z.string().trim().max(60).nullish(),
  passportCountry: countryCode.nullish(),
  passportExpiry: dateOnly.nullish(),
  emergencyContactName: z.string().trim().max(160).nullish(),
  emergencyContactPhone: z.string().trim().max(40).nullish(),
  emergencyContactRelationship: z.string().trim().max(60).nullish(),
  dietaryNotes: z.string().max(5000).nullish(),
  medicalNotes: z.string().max(5000).nullish(),
});

const updateTravellerSchema = atLeastOneField(
  createTravellerSchema.partial().extend({ isActive: z.boolean().optional() }).strict()
);

const createDocumentSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    destinationId: idLike.nullish(),
    reference: z.string().trim().max(120).nullish(),
    issuer: z.string().trim().max(160).nullish(),
    issuedOn: dateOnly.nullish(),
    expiresOn: dateOnly.nullish(),
    status: z.enum(['outstanding', 'submitted']).default('submitted'),
    altitudeCoverMetres: z.number().int().min(0).max(9000).nullish(),
    insurerContactPhone: z.string().trim().max(40).nullish(),
    notes: z.string().max(5000).nullish(),
  })
  .refine(
    (value) => !(value.issuedOn && value.expiresOn) || value.expiresOn >= value.issuedOn,
    { message: 'Expiry cannot be before the issue date.', path: ['expiresOn'] }
  );

const updateDocumentSchema = atLeastOneField(
  z
    .object({
      type: z.enum(DOCUMENT_TYPES).optional(),
      destinationId: idLike.nullish(),
      reference: z.string().trim().max(120).nullish(),
      issuer: z.string().trim().max(160).nullish(),
      issuedOn: dateOnly.nullish(),
      expiresOn: dateOnly.nullish(),
      status: z.enum(['outstanding', 'submitted', 'verified', 'rejected']).optional(),
      altitudeCoverMetres: z.number().int().min(0).max(9000).nullish(),
      insurerContactPhone: z.string().trim().max(40).nullish(),
      notes: z.string().max(5000).nullish(),
    })
    .strict()
);

const verifyDocumentSchema = z.object({
  approved: z.boolean(),
  notes: z.string().max(5000).nullish(),
});

const checklistQuerySchema = z.object({
  destinationIds: z
    .string()
    .min(1, 'Provide at least one destination id.')
    .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
    .refine((ids) => ids.length > 0, 'Provide at least one destination id.')
    .refine((ids) => ids.every((id) => /^\d+$/.test(id)), 'Destination ids must be numeric.'),
  departureDate: dateOnly.optional(),
  returnDate: dateOnly.optional(),
  maxAltitudeMetres: z
    .string()
    .regex(/^\d+$/, 'Must be a whole number of metres.')
    .transform(Number)
    .optional(),
});

module.exports = {
  DOCUMENT_TYPES,
  createTravellerSchema,
  updateTravellerSchema,
  createDocumentSchema,
  updateDocumentSchema,
  verifyDocumentSchema,
  checklistQuerySchema,
};
