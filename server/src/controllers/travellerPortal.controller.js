'use strict';

const travellerPortalService = require('../services/travellerPortal.service');
const notificationService = require('../services/notification.service');

async function listTrips(req, res, next) {
  try {
    const trips = await travellerPortalService.listTrips(req.traveller.id);
    res.status(200).json({ data: trips });
  } catch (error) {
    next(error);
  }
}

async function getTrip(req, res, next) {
  try {
    const trip = await travellerPortalService.getTrip(req.traveller.id, req.params.bookingId);
    res.status(200).json({ data: trip });
  } catch (error) {
    next(error);
  }
}

async function getTripPayments(req, res, next) {
  try {
    const payments = await travellerPortalService.getTripPayments(
      req.traveller.id,
      req.params.bookingId
    );
    res.status(200).json({ data: payments });
  } catch (error) {
    next(error);
  }
}

async function listDocuments(req, res, next) {
  try {
    const documents = await travellerPortalService.listDocuments(req.traveller.id);
    res.status(200).json({ data: documents });
  } catch (error) {
    next(error);
  }
}

async function addDocument(req, res, next) {
  try {
    const document = await travellerPortalService.addOwnDocument(
      req.traveller.id,
      req.body,
      req.file
    );
    res.status(201).json({ data: { document: document.toPublicJSON() } });
  } catch (error) {
    next(error);
  }
}

async function downloadDocumentFile(req, res, next) {
  try {
    const { document, absolutePath } = await travellerPortalService.getOwnDocumentFilePath(
      req.traveller.id,
      req.params.documentId
    );
    res.download(absolutePath, document.originalFileName || 'document');
  } catch (error) {
    next(error);
  }
}

async function listNotifications(req, res, next) {
  try {
    res.status(200).json(await notificationService.listForTraveller(req.query, req.traveller));
  } catch (error) {
    next(error);
  }
}

async function notificationsUnreadCount(req, res, next) {
  try {
    res.status(200).json({ data: await notificationService.travellerUnreadCount(req.traveller) });
  } catch (error) {
    next(error);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const notification = await notificationService.markReadForTraveller(
      req.params.id,
      req.traveller
    );
    res.status(200).json({ data: { notification: notification.toPublicJSON() } });
  } catch (error) {
    next(error);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    res.status(200).json({ data: await notificationService.markAllReadForTraveller(req.traveller) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listTrips,
  getTrip,
  getTripPayments,
  listDocuments,
  addDocument,
  downloadDocumentFile,
  listNotifications,
  notificationsUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
};
