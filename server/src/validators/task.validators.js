'use strict';

const { z } = require('zod');

const { idLike, dateOnly, atLeastOneField, paginationQuery } = require('./common');

const CATEGORIES = ['documents', 'payment', 'operator', 'itinerary', 'admin', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'];

const title = z
  .string({ required_error: 'Give the task a title.' })
  .trim()
  .min(3, 'Say what needs doing, in a few words.')
  .max(200, 'Keep the title under 200 characters.');

const note = z.string().trim().max(1000, 'Keep it under 1000 characters.');

const createTaskSchema = z.object({
  bookingId: idLike,
  travellerId: idLike.optional().nullable(),
  title,
  description: z.string().trim().max(5000).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueOn: dateOnly.optional().nullable(),
  assignedToUserId: idLike.optional().nullable(),
});

const updateTaskSchema = atLeastOneField(
  z.object({
    title: title.optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    dueOn: dateOnly.optional().nullable(),
    travellerId: idLike.optional().nullable(),
  })
);

/**
 * `userId: null` releases the task back to the unassigned queue, so null has to
 * survive validation rather than being treated as a missing field.
 */
const assignSchema = z.object({
  userId: idLike.nullable(),
  note: note.optional(),
});

const statusSchema = z.object({
  status: z.enum(STATUSES, { required_error: 'Choose a status.' }),
  note: note.optional(),
  blockedReason: z.string().trim().max(500).optional(),
});

const noteSchema = z.object({
  note: note.min(1, 'Write something before saving a note.'),
});

/**
 * Assigning a specific document to a specific reviewer.
 *
 * `bookingId` is optional — most travellers are on exactly one live booking
 * and the service resolves it automatically — but stays available for the
 * rare case (a repeat traveller with more than one open trip) where it is
 * ambiguous and the service asks for it explicitly.
 */
const assignDocumentReviewerSchema = z.object({
  userId: idLike,
  bookingId: idLike.optional().nullable(),
  note: note.optional(),
});

const handoverSchema = z.object({
  fromUserId: idLike,
  toUserId: idLike,
  // Optional, so a handover can be scoped to one booking rather than a person's
  // entire caseload — useful when only one trip is changing hands.
  bookingId: idLike.optional().nullable(),
  note: note.optional(),
});

const listQuerySchema = paginationQuery.extend({
  bookingId: idLike.optional(),
  travellerId: idLike.optional(),
  documentId: idLike.optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  // 'open' (the three live states), 'all', or one exact status.
  status: z.enum([...STATUSES, 'open', 'all']).optional(),
  assignedTo: z.union([z.enum(['me', 'unassigned']), idLike]).optional(),
  overdue: z.string().optional(),
  dueBefore: dateOnly.optional(),
});

module.exports = {
  createTaskSchema,
  updateTaskSchema,
  assignSchema,
  statusSchema,
  noteSchema,
  assignDocumentReviewerSchema,
  handoverSchema,
  listQuerySchema,
};
