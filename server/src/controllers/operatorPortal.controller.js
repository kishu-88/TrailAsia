'use strict';

const operatorPortalService = require('../services/operatorPortal.service');
const notificationService = require('../services/notification.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const listConfirmations = handle(async (req, res) => {
  res.json(await operatorPortalService.listConfirmations(req.operator.id, req.query));
});

const getConfirmation = handle(async (req, res) => {
  const confirmation = await operatorPortalService.getConfirmation(
    req.operator.id,
    req.params.confirmationId
  );
  res.json({ data: { confirmation: confirmation.toPublicJSON() } });
});

const respond = handle(async (req, res) => {
  const confirmation = await operatorPortalService.respond(
    req.operator.id,
    req.params.confirmationId,
    req.body
  );
  res.json({ data: { confirmation: confirmation.toPublicJSON() } });
});

const listNotifications = handle(async (req, res) => {
  res.json(await notificationService.listForOperator(req.query, req.operator));
});

const notificationsUnreadCount = handle(async (req, res) => {
  res.json({ data: await notificationService.operatorUnreadCount(req.operator) });
});

const markNotificationRead = handle(async (req, res) => {
  const notification = await notificationService.markReadForOperator(
    req.params.id,
    req.operator
  );
  res.json({ data: { notification: notification.toPublicJSON() } });
});

const markAllNotificationsRead = handle(async (req, res) => {
  res.json({ data: await notificationService.markAllReadForOperator(req.operator) });
});

module.exports = {
  listConfirmations,
  getConfirmation,
  respond,
  listNotifications,
  notificationsUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
};
