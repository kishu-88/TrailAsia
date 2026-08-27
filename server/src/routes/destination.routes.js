'use strict';

const express = require('express');

const destinationController = require('../controllers/destination.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { validateBody } = require('../validators/common');
const {
  createDestinationSchema,
  updateDestinationSchema,
  createRequirementSchema,
  updateRequirementSchema,
} = require('../validators/destination.validators');

const router = express.Router();

router.use(authenticate);

// Reference data: everyone reads, coordinators and admins maintain.
const canEdit = requireRole(requireRole.REFERENCE_EDITORS);

router.get('/', destinationController.list);
router.get('/:id', destinationController.get);
router.post('/', canEdit, validateBody(createDestinationSchema), destinationController.create);
router.patch('/:id', canEdit, validateBody(updateDestinationSchema), destinationController.update);
router.delete('/:id', canEdit, destinationController.deactivate);
router.post('/:id/reactivate', canEdit, destinationController.reactivate);
// Hard delete is admin-only, and refused if anything references the destination.
router.delete('/:id/permanent', requireRole(requireRole.ADMIN_ONLY), destinationController.destroy);

router.get('/:id/document-requirements', destinationController.listRequirements);
router.post(
  '/:id/document-requirements',
  canEdit,
  validateBody(createRequirementSchema),
  destinationController.addRequirement
);
router.patch(
  '/:id/document-requirements/:requirementId',
  canEdit,
  validateBody(updateRequirementSchema),
  destinationController.updateRequirement
);
router.delete(
  '/:id/document-requirements/:requirementId',
  canEdit,
  destinationController.deleteRequirement
);

module.exports = router;
