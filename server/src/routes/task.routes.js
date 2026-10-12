'use strict';

const express = require('express');

const taskController = require('../controllers/task.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { validateBody, validateQuery } = require('../validators/common');
const {
  createTaskSchema,
  updateTaskSchema,
  assignSchema,
  statusSchema,
  noteSchema,
  handoverSchema,
  listQuerySchema,
} = require('../validators/task.validators');

const router = express.Router();

router.use(authenticate);

/**
 * Everyone reads the queue; trip editors own and move work.
 *
 * Finance is included in the read because "what is still outstanding on this
 * departure" is a reconciliation question as much as an operations one, and a
 * finance officer who has to ask a consultant is the exact friction the module
 * removes. They cannot be assigned work — see ASSIGNABLE_ROLES.
 */
const canRead = requireRole(requireRole.ANY_STAFF);
const canEdit = requireRole(requireRole.TRIP_EDITORS);

// Before `/:id`, or "summary" and "handover" get read as task ids.
router.get('/summary', canRead, taskController.summary);
router.get('/workload/:userId', canRead, taskController.workload);
router.post('/handover', canEdit, validateBody(handoverSchema), taskController.handover);

router.get('/', canRead, validateQuery(listQuerySchema), taskController.list);
router.post('/', canEdit, validateBody(createTaskSchema), taskController.create);

router.get('/:id', canRead, taskController.get);
router.patch('/:id', canEdit, validateBody(updateTaskSchema), taskController.update);

router.post('/:id/assign', canEdit, validateBody(assignSchema), taskController.assign);
router.post('/:id/status', canEdit, validateBody(statusSchema), taskController.changeStatus);
router.post('/:id/notes', canEdit, validateBody(noteSchema), taskController.addNote);
router.get('/:id/events', canRead, taskController.listEvents);

module.exports = router;
