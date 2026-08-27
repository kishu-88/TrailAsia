'use strict';

const express = require('express');

const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/requireRole');
const { validateBody } = require('../validators/common');
const {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
} = require('../validators/user.validators');

const router = express.Router();

// Staff account management is administrator-only, without exception.
router.use(authenticate, requireRole(requireRole.ADMIN_ONLY));

router.get('/', userController.list);
router.post('/', validateBody(createUserSchema), userController.create);
router.get('/:id', userController.get);
router.patch('/:id', validateBody(updateUserSchema), userController.update);
router.delete('/:id', userController.deactivate);
router.post('/:id/reactivate', userController.reactivate);
router.post('/:id/unlock', userController.unlock);
router.post(
  '/:id/password',
  validateBody(resetPasswordSchema),
  userController.resetPassword
);

module.exports = router;
