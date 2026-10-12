'use strict';

const notificationService = require('../services/notification.service');

const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const list = handle(async (req, res) => {
  res.json(await notificationService.list(req.query, req.user));
});

const unreadCount = handle(async (req, res) => {
  res.json({ data: await notificationService.unreadCount(req.user) });
});

const markRead = handle(async (req, res) => {
  const notification = await notificationService.markRead(req.params.id, req.user);
  res.json({ data: { notification: notification.toPublicJSON() } });
});

const markAllRead = handle(async (req, res) => {
  res.json({ data: await notificationService.markAllRead(req.user) });
});

module.exports = { list, unreadCount, markRead, markAllRead };
