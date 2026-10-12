'use strict';

const { z } = require('zod');
const { dateOnly, idLike } = require('./common');
const { DOCUMENT_TYPES } = require('./traveller.validators');

/**
 * A traveller adding one of their own documents from the portal.
 *
 * Narrower than the staff `createDocumentSchema`: no `status` (always lands
 * `submitted`, see `travellerPortal.service.js#addOwnDocument`) and no
 * `altitudeCoverMetres`/`insurerContactPhone` — those are read off the policy
 * by whoever verifies it, not guessed by the traveller filling in the form.
 */
const addOwnDocumentSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    destinationId: idLike.nullish(),
    reference: z.string().trim().max(120).nullish(),
    issuer: z.string().trim().max(160).nullish(),
    issuedOn: dateOnly.nullish(),
    expiresOn: dateOnly.nullish(),
    filePath: z.string().trim().url('Enter a valid link to the document.').max(500).nullish(),
    notes: z.string().max(2000).nullish(),
  })
  .refine(
    (value) => !(value.issuedOn && value.expiresOn) || value.expiresOn >= value.issuedOn,
    { message: 'Expiry cannot be before the issue date.', path: ['expiresOn'] }
  );

module.exports = { addOwnDocumentSchema };
