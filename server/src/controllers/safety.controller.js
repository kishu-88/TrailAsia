'use strict';

const safetyService = require('../services/safety.service');

// --- Traveller-facing ------------------------------------------------------

async function summary(req, res, next) {
  try {
    const data = await safetyService.travellerSummary(
      req.traveller.id,
      req.validatedQuery.bookingId
    );
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

async function setConsent(req, res, next) {
  try {
    const consent = await safetyService.setConsent(req.traveller.id, req.body.bookingId, {
      granted: req.body.granted,
    });
    res.status(200).json({ data: consent.toPublicJSON() });
  } catch (error) {
    next(error);
  }
}

async function recordPing(req, res, next) {
  try {
    const { ping, stored } = await safetyService.recordPing(req.traveller.id, req.body);
    // 202 when the ping arrived sooner than the minimum interval and was
    // folded into the last one. The client is behaving correctly and there is
    // nothing for it to fix, so this is not an error.
    res.status(stored ? 201 : 202).json({ data: { ...ping.toPublicJSON(), stored } });
  } catch (error) {
    next(error);
  }
}

async function listPings(req, res, next) {
  try {
    const { bookingId, limit } = req.validatedQuery;
    const pings = await safetyService.listPings(req.traveller.id, bookingId, { limit });
    res.status(200).json({ data: pings.map((ping) => ping.toPublicJSON()) });
  } catch (error) {
    next(error);
  }
}

async function raiseSos(req, res, next) {
  try {
    const { alert, created } = await safetyService.raiseSos(req.traveller.id, req.body);
    // 200 rather than 201 when an open alert already existed: the button was
    // pressed again, which is normal, and nothing new was created.
    res.status(created ? 201 : 200).json({ data: alert.toPublicJSON() });
  } catch (error) {
    next(error);
  }
}

async function cancelSos(req, res, next) {
  try {
    const alert = await safetyService.cancelSos(req.traveller.id, req.params.id);
    res.status(200).json({ data: alert.toPublicJSON() });
  } catch (error) {
    next(error);
  }
}

// --- Staff-facing ----------------------------------------------------------

async function listAlerts(req, res, next) {
  try {
    const alerts = await safetyService.listAlerts(req.validatedQuery || {});
    res.status(200).json({ data: alerts.map((alert) => alert.toPublicJSON()) });
  } catch (error) {
    next(error);
  }
}

async function getAlert(req, res, next) {
  try {
    const alert = await safetyService.getAlert(req.params.id);
    res.status(200).json({ data: alert.toPublicJSON() });
  } catch (error) {
    next(error);
  }
}

async function acknowledgeAlert(req, res, next) {
  try {
    const alert = await safetyService.acknowledgeSos(req.params.id, req.user);
    res.status(200).json({ data: alert.toPublicJSON() });
  } catch (error) {
    next(error);
  }
}

async function assignAlert(req, res, next) {
  try {
    const alert = await safetyService.assignSos(req.params.id, req.body.userId, req.user);
    res.status(200).json({ data: alert.toPublicJSON() });
  } catch (error) {
    next(error);
  }
}

async function resolveAlert(req, res, next) {
  try {
    const alert = await safetyService.resolveSos(req.params.id, req.body, req.user);
    res.status(200).json({ data: alert.toPublicJSON() });
  } catch (error) {
    next(error);
  }
}

async function listAlertEvents(req, res, next) {
  try {
    res.status(200).json({ data: await safetyService.listAlertEvents(req.params.id) });
  } catch (error) {
    next(error);
  }
}

async function listEvents(req, res, next) {
  try {
    // Already `{ data, meta }` — the paginated envelope every list uses.
    res.status(200).json(await safetyService.listEvents(req.validatedQuery || {}));
  } catch (error) {
    next(error);
  }
}

async function partyLocations(req, res, next) {
  try {
    const data = await safetyService.partyLocations(req.params.bookingId);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  summary,
  setConsent,
  recordPing,
  listPings,
  raiseSos,
  cancelSos,
  listAlerts,
  getAlert,
  acknowledgeAlert,
  assignAlert,
  resolveAlert,
  listAlertEvents,
  listEvents,
  partyLocations,
};
