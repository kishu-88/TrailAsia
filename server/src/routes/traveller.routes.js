'use strict';

const express = require('express');

const travellerController = require('../controllers/traveller.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const uploadDocument = require('../middleware/uploadDocument');
const { validateBody, validateQuery } = require('../validators/common');
const {
  createTravellerSchema,
  updateTravellerSchema,
  createDocumentSchema,
  updateDocumentSchema,
  verifyDocumentSchema,
  checklistQuerySchema,
} = require('../validators/traveller.validators');
const { assignDocumentReviewerSchema } = require('../validators/task.validators');

const router = express.Router();

router.use(authenticate);

const canEdit = requireRole(requireRole.TRIP_EDITORS);
// Verifying a document is an assurance step, so it is kept away from the person
// who entered it in the first place — coordinators and admins only.
const canVerify = requireRole(requireRole.REFERENCE_EDITORS);

router.get('/', travellerController.list);
router.post('/', canEdit, validateBody(createTravellerSchema), travellerController.create);
router.get('/:id', travellerController.get);
router.patch('/:id', canEdit, validateBody(updateTravellerSchema), travellerController.update);
router.delete('/:id', canEdit, travellerController.deactivate);
router.post('/:id/reactivate', canEdit, travellerController.reactivate);

/**
 * Portal access, managed by whoever is running the trip.
 *
 * Not admin-only: the consultant who set the booking up is the person the
 * traveller will ring when the link does not work, and routing that through an
 * administrator adds a delay without adding a check — the consultant already
 * has full access to the record the portal exposes.
 */
router.post('/:id/portal-invite', canEdit, travellerController.issuePortalInvite);
router.delete('/:id/portal-access', canEdit, travellerController.revokePortalAccess);

router.get(
  '/:id/document-checklist',
  validateQuery(checklistQuerySchema),
  travellerController.checklist
);

router.get('/:id/documents', travellerController.listDocuments);
router.post(
  '/:id/documents',
  canEdit,
  validateBody(createDocumentSchema),
  travellerController.addDocument
);
router.get('/:id/documents/:documentId', travellerController.getDocument);
router.patch(
  '/:id/documents/:documentId',
  canEdit,
  validateBody(updateDocumentSchema),
  travellerController.updateDocument
);
router.post(
  '/:id/documents/:documentId/verify',
  canVerify,
  validateBody(verifyDocumentSchema),
  travellerController.verifyDocument
);
router.delete('/:id/documents/:documentId', canEdit, travellerController.deleteDocument);

// Handing a specific document to a specific reviewer — the same edit rights as
// the rest of the document row, not the narrower verify-only role, since this
// is about routing the work rather than passing judgment on it.
router.post(
  '/:id/documents/:documentId/assign-reviewer',
  canEdit,
  validateBody(assignDocumentReviewerSchema),
  travellerController.assignDocumentReviewer
);

// Same duty split as the rest of this row: whoever can edit the document's
// fields can also attach a file to it. Reading the file back requires no
// extra role beyond being signed in as staff at all — the same as reading
// the document's other fields via GET above.
router.post(
  '/:id/documents/:documentId/file',
  canEdit,
  uploadDocument,
  travellerController.uploadDocumentFile
);
router.get('/:id/documents/:documentId/file', travellerController.downloadDocumentFile);

module.exports = router;
