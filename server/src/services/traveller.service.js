'use strict';

const { Op } = require('sequelize');

const {
  Traveller,
  TravellerDocument,
  Destination,
  DocumentRequirement,
  OperatorConfirmation,
  User,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { parseListQuery, paginated } = require('../utils/pagination');
const notificationService = require('./notification.service');
const fileStorage = require('./fileStorage.service');
// Required lazily inside verifyDocument, not at module load: task.service ->
// booking.service -> traveller.service is already a cycle, and requiring it
// up here would hand booking.service a half-built traveller.service export
// (Node resolves a cyclic require to whatever the module has exported so
// far, which at that point is nothing yet).
const taskService = () => require('./task.service');

const SORTABLE = ['createdAt', 'lastName', 'firstName', 'email', 'passportExpiry'];

// --- Travellers ------------------------------------------------------------

async function list(query) {
  const options = parseListQuery(query, { sortable: SORTABLE, defaultSort: 'lastName:asc' });
  const where = {};

  if (query.isActive !== undefined && query.isActive !== '') {
    where.isActive = ['1', 'true', 'yes'].includes(String(query.isActive).toLowerCase());
  }
  if (query.nationality) where.nationality = String(query.nationality).toUpperCase();
  if (query.q) {
    const term = `%${query.q}%`;
    where[Op.or] = [
      { firstName: { [Op.like]: term } },
      { lastName: { [Op.like]: term } },
      { email: { [Op.like]: term } },
    ];
  }

  const result = await Traveller.findAndCountAll({
    where,
    limit: options.limit,
    offset: options.offset,
    order: options.order,
  });

  // Passport numbers stay masked in list responses without exception.
  return paginated(result, options, (row) => row.toPublicJSON());
}

async function getById(id, { withDocuments = false } = {}) {
  const traveller = await Traveller.findByPk(id, {
    include: withDocuments
      ? [
          {
            model: TravellerDocument,
            as: 'documents',
            required: false,
            include: [
              { model: Destination, as: 'destination', required: false },
              { model: User, as: 'verifiedBy', required: false },
            ],
          },
        ]
      : [],
  });
  if (!traveller) throw ApiError.notFound('Traveller not found.');
  return traveller;
}

async function create(payload, actingUser) {
  return Traveller.create({ ...payload, createdByUserId: actingUser.id });
}

async function update(id, changes) {
  const traveller = await getById(id);
  await traveller.update(changes);
  return traveller;
}

/** Deactivated, not deleted — past bookings reference the record. */
async function deactivate(id) {
  const traveller = await getById(id);
  await traveller.update({ isActive: false });
  return traveller;
}

async function reactivate(id) {
  const traveller = await getById(id);
  await traveller.update({ isActive: true });
  return traveller;
}

// --- Documents -------------------------------------------------------------

async function listDocuments(travellerId) {
  await getById(travellerId);
  return TravellerDocument.findAll({
    where: { travellerId },
    include: [
      { model: Destination, as: 'destination', required: false },
      { model: User, as: 'verifiedBy', required: false },
      { model: OperatorConfirmation, as: 'operatorConfirmation', required: false },
    ],
    order: [
      ['type', 'ASC'],
      ['createdAt', 'DESC'],
    ],
  });
}

async function getDocument(id) {
  const document = await TravellerDocument.findByPk(id, {
    include: [
      { model: Destination, as: 'destination', required: false },
      { model: User, as: 'verifiedBy', required: false },
      { model: OperatorConfirmation, as: 'operatorConfirmation', required: false },
    ],
  });
  if (!document) throw ApiError.notFound('Document not found.');
  return document;
}

async function assertConfirmationExists(operatorConfirmationId) {
  if (!operatorConfirmationId) return;
  const confirmation = await OperatorConfirmation.findByPk(operatorConfirmationId);
  if (!confirmation) {
    throw ApiError.badRequest('That operator confirmation does not exist.', {
      code: 'INVALID_OPERATOR_CONFIRMATION',
      details: { operatorConfirmationId: 'Not found.' },
    });
  }
}

async function addDocument(travellerId, payload) {
  await getById(travellerId);
  if (payload.destinationId) {
    const destination = await Destination.findByPk(payload.destinationId);
    if (!destination) {
      throw ApiError.badRequest('That destination does not exist.', {
        code: 'INVALID_DESTINATION',
        details: { destinationId: 'Not found.' },
      });
    }
  }
  await assertConfirmationExists(payload.operatorConfirmationId);
  const created = await TravellerDocument.create({ ...payload, travellerId });
  return getDocument(created.id);
}

async function updateDocument(id, changes) {
  const document = await getDocument(id);
  await assertConfirmationExists(changes.operatorConfirmationId);

  // Editing the substance of a document invalidates a previous verification —
  // otherwise someone could get a policy verified and then change its altitude
  // cover, and the checklist would still show a green tick.
  const substantive = ['reference', 'expiresOn', 'altitudeCoverMetres', 'type', 'issuer'];
  const changesSubstance = substantive.some(
    (field) => changes[field] !== undefined && String(changes[field]) !== String(document[field])
  );

  if (changesSubstance && document.status === 'verified' && changes.status === undefined) {
    changes.status = 'submitted';
    changes.verifiedAt = null;
    changes.verifiedByUserId = null;
  }

  await document.update(changes);
  return getDocument(id);
}

/**
 * Record that a member of staff has sighted the document.
 *
 * For insurance this is the step Section 4.3 of the business case is built
 * around: someone confirms the policy exists and covers the altitude before a
 * traveller is ever asked to agree to an evacuation.
 */
async function verifyDocument(id, { approved, notes }, actingUser) {
  const document = await getDocument(id);

  if (document.isExpired()) {
    throw ApiError.badRequest('This document has expired and cannot be verified.', {
      code: 'DOCUMENT_EXPIRED',
    });
  }

  await document.update({
    status: approved ? 'verified' : 'rejected',
    verifiedAt: new Date(),
    verifiedByUserId: actingUser.id,
    notes: notes !== undefined ? notes : document.notes,
  });

  // The consultant who entered the record is the one waiting on this answer —
  // verification is deliberately somebody else's job, so they would otherwise
  // have to keep checking.
  const traveller = await getById(document.travellerId);
  await notificationService.documentReviewed(document, traveller, approved, actingUser);
  // Whoever this was assigned to for review is done once it has an answer,
  // whichever way it went — a rejected document gets a fresh review task
  // (and a fresh assignment) only if someone deliberately raises one.
  await taskService().closeDocumentReviewTask(document.id, actingUser);

  return getDocument(id);
}

async function deleteDocument(id) {
  const document = await getDocument(id);
  await fileStorage.remove(document.storedFileName);
  await document.destroy();
}

/**
 * Attach (or replace) an uploaded file on an existing document row.
 *
 * A previous file, if there was one, is deleted from disk only after the new
 * one is safely written and the row updated — so a failed upload never
 * leaves the document pointing at nothing. Attaching a file is a substantive
 * change to what the document actually is, so it invalidates a previous
 * verification the same way editing its reference or expiry does.
 */
async function attachDocumentFile(id, file) {
  const document = await getDocument(id);
  const stored = await fileStorage.store({
    travellerId: document.travellerId,
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
  });

  const changes = {
    storedFileName: stored.storedFileName,
    originalFileName: stored.originalFileName,
    fileMimeType: stored.mimeType,
    fileSizeBytes: stored.sizeBytes,
  };
  if (document.status === 'verified') {
    changes.status = 'submitted';
    changes.verifiedAt = null;
    changes.verifiedByUserId = null;
  }

  const previousFileName = document.storedFileName;
  await document.update(changes);
  await fileStorage.remove(previousFileName);

  return getDocument(id);
}

/** The absolute path to a document's uploaded file, or null if it has none. */
async function getDocumentFilePath(id) {
  const document = await getDocument(id);
  if (!document.storedFileName) {
    throw ApiError.notFound('This document has no uploaded file.');
  }
  return { document, absolutePath: fileStorage.resolvePath(document.storedFileName) };
}

// --- Document checklist ----------------------------------------------------

function addMonths(dateString, months) {
  const date = new Date(dateString);
  date.setMonth(date.getMonth() + months);
  return date;
}

function toDateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

/**
 * Compare what a destination requires against what a traveller actually holds.
 *
 * This is the answer to "what is outstanding, and by when" — the question that
 * currently costs a consultant a second spreadsheet and a phone call.
 *
 * @param {object} opts
 * @param {number|string} opts.travellerId
 * @param {Array<number|string>} opts.destinationIds
 * @param {string|null} opts.departureDate  Used for due dates and validity windows.
 * @param {string|null} opts.returnDate     Passport validity is measured from the return.
 * @param {number|null} opts.maxAltitudeMetres  Highest point of the trip, if known.
 */
async function buildChecklist({
  travellerId,
  destinationIds,
  departureDate = null,
  returnDate = null,
  maxAltitudeMetres = null,
}) {
  const traveller = await getById(travellerId);

  const destinations = await Destination.findAll({
    where: { id: { [Op.in]: destinationIds } },
    include: [
      {
        model: DocumentRequirement,
        as: 'documentRequirements',
        required: false,
        where: { isActive: true },
      },
    ],
  });

  const documents = await TravellerDocument.findAll({ where: { travellerId } });
  const items = [];

  for (const destination of destinations) {
    for (const requirement of destination.documentRequirements || []) {
      // A document counts if the type matches and it is either for this
      // destination or not destination-specific (a passport is a passport).
      // Newest first: when none of them will do, the latest is the one worth
      // reporting on.
      const candidates = documents
        .filter(
          (doc) =>
            doc.type === requirement.type &&
            (doc.destinationId === null ||
              String(doc.destinationId) === String(destination.id))
        )
        .sort((a, b) => Number(b.id) - Number(a.id));

      /** What one document does for this requirement: its status, and what is wrong with it. */
      const assess = (doc) => {
        const problems = [];

        if (doc.expiresOn) {
          if (requirement.type === 'passport') {
            checkPassportValidity(doc.expiresOn, requirement, returnDate, problems);
          } else if (departureDate && doc.expiresOn < toDateOnly(departureDate)) {
            problems.push('Expires before departure.');
          }
        }

        if (requirement.requiresAltitudeCover) {
          const needed = maxAltitudeMetres || destination.maxAltitudeMetres;
          if (!doc.altitudeCoverMetres) {
            problems.push('Policy does not state an altitude limit.');
          } else if (needed && doc.altitudeCoverMetres < needed) {
            problems.push(
              `Altitude cover is ${doc.altitudeCoverMetres.toLocaleString('en-AU')} m ` +
                `but the itinerary reaches ${needed.toLocaleString('en-AU')} m.`
            );
          }
          if (!doc.insurerContactPhone) {
            problems.push('No insurer contact number recorded.');
          }
        }

        return { doc, status: doc.effectiveStatus(), problems };
      };

      // Any one document that fully meets the requirement meets it. Otherwise
      // the newest is what the checklist describes — so a traveller who
      // replaces a rejected or expiring document sees the replacement being
      // checked, not the old one still failing. Taking simply the first match,
      // as this used to, reported whichever row the database happened to
      // return first, which made a re-upload invisible.
      const assessed = candidates.map(assess);
      const chosen =
        assessed.find((entry) => entry.status === 'verified' && entry.problems.length === 0) ||
        assessed[0] ||
        null;
      const held = chosen ? chosen.doc : null;

      const issues = [];
      let status;

      if (!held) {
        // Fall back to the passport recorded on the traveller record itself.
        if (requirement.type === 'passport' && traveller.passportNumber) {
          status = 'on_file';
          if (traveller.passportExpiry) {
            checkPassportValidity(traveller.passportExpiry, requirement, returnDate, issues);
          }
        } else {
          status = 'missing';
        }
      } else {
        status = chosen.status;
        issues.push(...chosen.problems);
      }

      const dueBy = departureDate
        ? toDateOnly(
            new Date(
              new Date(departureDate).getTime() -
                requirement.leadTimeDays * 24 * 60 * 60 * 1000
            )
          )
        : null;

      const satisfied =
        (status === 'verified' || status === 'on_file') && issues.length === 0;

      items.push({
        destination: {
          id: String(destination.id),
          code: destination.code,
          name: destination.name,
        },
        requirement: {
          id: String(requirement.id),
          type: requirement.type,
          name: requirement.name,
          isMandatory: requirement.isMandatory,
          requiresAltitudeCover: requirement.requiresAltitudeCover,
        },
        documentId: held ? String(held.id) : null,
        status,
        satisfied,
        issues,
        dueBy,
        overdue: Boolean(
          dueBy && !satisfied && toDateOnly(new Date()) > dueBy
        ),
      });
    }
  }

  const mandatory = items.filter((item) => item.requirement.isMandatory);
  const outstanding = mandatory.filter((item) => !item.satisfied);

  return {
    traveller: {
      id: String(traveller.id),
      fullName: traveller.fullName(),
    },
    summary: {
      total: items.length,
      mandatory: mandatory.length,
      satisfied: mandatory.length - outstanding.length,
      outstanding: outstanding.length,
      overdue: items.filter((item) => item.overdue).length,
      ready: outstanding.length === 0,
    },
    items,
  };
}

function checkPassportValidity(expiry, requirement, returnDate, issues) {
  const months = requirement.minValidityMonths;
  if (!months) return;
  const reference = returnDate ? new Date(returnDate) : new Date();
  const requiredUntil = addMonths(reference, months);
  if (new Date(expiry) < requiredUntil) {
    issues.push(
      `Passport must be valid for ${months} months beyond ${
        returnDate ? 'the return date' : 'today'
      } — until ${formatReadableDate(requiredUntil)}.`
    );
  }
}

/**
 * These strings are shown to travellers, not only to staff, so a bare ISO date
 * is the wrong output. "15 April 2027" needs no decoding on a phone.
 */
function formatReadableDate(date) {
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  deactivate,
  reactivate,
  listDocuments,
  getDocument,
  addDocument,
  updateDocument,
  verifyDocument,
  deleteDocument,
  attachDocumentFile,
  getDocumentFilePath,
  buildChecklist,
};
