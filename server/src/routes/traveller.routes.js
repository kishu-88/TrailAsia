'use strict';

const express = require('express');

const travellerController = require('../controllers/traveller.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { validateBody, validateQuery } = require('../validators/common');
const {
  createTravellerSchema,
  updateTravellerSchema,
  createDocumentSchema,
  updateDocumentSchema,
  verifyDocumentSchema,
  checklistQuerySchema,
} = require('../validators/traveller.validators');

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

module.exports = router;
