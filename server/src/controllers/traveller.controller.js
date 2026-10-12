'use strict';

const travellerService = require('../services/traveller.service');
const travellerAuthService = require('../services/travellerAuth.service');
const taskService = require('../services/task.service');
const ApiError = require('../utils/ApiError');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/**
 * Who may see an unmasked passport number.
 *
 * Consultants and coordinators need it to complete visa and permit applications.
 * Finance has no reason to, so they see the masked value like everybody else —
 * that is what duty separation means in practice.
 */
function maySeePassport(user) {
  return ['consultant', 'coordinator', 'admin'].includes(user.role);
}

const list = handle(async (req, res) => {
  res.json(await travellerService.list(req.query));
});

const get = handle(async (req, res) => {
  const traveller = await travellerService.getById(req.params.id, { withDocuments: true });
  res.json({
    data: {
      traveller: traveller.toPublicJSON({ includePassport: maySeePassport(req.user) }),
    },
  });
});

const create = handle(async (req, res) => {
  const traveller = await travellerService.create(req.body, req.user);
  res.status(201).json({
    data: { traveller: traveller.toPublicJSON({ includePassport: maySeePassport(req.user) }) },
  });
});

const update = handle(async (req, res) => {
  const traveller = await travellerService.update(req.params.id, req.body);
  res.json({
    data: { traveller: traveller.toPublicJSON({ includePassport: maySeePassport(req.user) }) },
  });
});

const deactivate = handle(async (req, res) => {
  const traveller = await travellerService.deactivate(req.params.id);
  res.json({ data: { traveller: traveller.toPublicJSON() } });
});

const reactivate = handle(async (req, res) => {
  const traveller = await travellerService.reactivate(req.params.id);
  res.json({ data: { traveller: traveller.toPublicJSON() } });
});

// --- Documents -------------------------------------------------------------

const listDocuments = handle(async (req, res) => {
  const documents = await travellerService.listDocuments(req.params.id);
  res.json({ data: documents.map((doc) => doc.toPublicJSON()) });
});

const addDocument = handle(async (req, res) => {
  const document = await travellerService.addDocument(req.params.id, req.body);
  res.status(201).json({ data: { document: document.toPublicJSON() } });
});

const getDocument = handle(async (req, res) => {
  const document = await travellerService.getDocument(req.params.documentId);
  res.json({ data: { document: document.toPublicJSON() } });
});

const updateDocument = handle(async (req, res) => {
  const document = await travellerService.updateDocument(req.params.documentId, req.body);
  res.json({ data: { document: document.toPublicJSON() } });
});

const verifyDocument = handle(async (req, res) => {
  const document = await travellerService.verifyDocument(
    req.params.documentId,
    req.body,
    req.user
  );
  res.json({ data: { document: document.toPublicJSON() } });
});

const deleteDocument = handle(async (req, res) => {
  await travellerService.deleteDocument(req.params.documentId);
  res.status(204).send();
});

const assignDocumentReviewer = handle(async (req, res) => {
  const task = await taskService.assignDocumentReviewer(
    req.params.documentId,
    req.body,
    req.user
  );
  res.json({ data: { task: task.toPublicJSON() } });
});

const uploadDocumentFile = handle(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No file was included in the upload.', {
      code: 'VALIDATION_ERROR',
      details: { file: 'Required.' },
    });
  }
  const document = await travellerService.attachDocumentFile(req.params.documentId, req.file);
  res.status(200).json({ data: { document: document.toPublicJSON() } });
});

const downloadDocumentFile = handle(async (req, res) => {
  const { document, absolutePath } = await travellerService.getDocumentFilePath(
    req.params.documentId
  );
  res.download(absolutePath, document.originalFileName || 'document');
});

const checklist = handle(async (req, res) => {
  const query = req.validatedQuery;
  const result = await travellerService.buildChecklist({
    travellerId: req.params.id,
    destinationIds: query.destinationIds,
    departureDate: query.departureDate || null,
    returnDate: query.returnDate || null,
    maxAltitudeMetres: query.maxAltitudeMetres || null,
  });
  res.json({ data: result });
});

/**
 * Issue a portal invitation.
 *
 * The plaintext token comes back exactly once, in this response, and is never
 * readable again. The consultant passes it to the traveller; there is no mail
 * transport in this release, which is stated in the response rather than left
 * for somebody to discover.
 */
const issuePortalInvite = handle(async (req, res) => {
  const result = await travellerAuthService.issueInvite(req.params.id);
  res.status(201).json({
    data: {
      ...result,
      delivery: result.emailed
        ? 'This link has been emailed to the traveller.'
        : 'Give this link to the traveller yourself — it was not emailed.',
    },
  });
});

/** Withdraw portal access and end every session the traveller currently holds. */
const revokePortalAccess = handle(async (req, res) => {
  const traveller = await travellerAuthService.revokeAccess(req.params.id);
  res.json({ data: { traveller } });
});

module.exports = {
  list,
  get,
  create,
  update,
  deactivate,
  reactivate,
  issuePortalInvite,
  revokePortalAccess,
  listDocuments,
  addDocument,
  getDocument,
  updateDocument,
  verifyDocument,
  deleteDocument,
  assignDocumentReviewer,
  uploadDocumentFile,
  downloadDocumentFile,
  checklist,
};
