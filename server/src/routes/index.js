'use strict';

const express = require('express');

const authRoutes = require('./auth.routes');
const travellerAuthRoutes = require('./travellerAuth.routes');
const operatorAuthRoutes = require('./operatorAuth.routes');
const userRoutes = require('./user.routes');
const destinationRoutes = require('./destination.routes');
const travellerRoutes = require('./traveller.routes');
const bookingRoutes = require('./booking.routes');
const operatorRoutes = require('./operator.routes');
const operatorPortalRoutes = require('./operatorPortal.routes');
const paymentRoutes = require('./payment.routes');
const reportRoutes = require('./report.routes');
const taskRoutes = require('./task.routes');
const notificationRoutes = require('./notification.routes');
const emailLogRoutes = require('./emailLog.routes');
const safetyRoutes = require('./safety.routes');
const meRoutes = require('./me.routes');
const publicRoutes = require('./public.routes');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', uptime: process.uptime() } });
});

// Mounted before /auth so the traveller/operator routes are matched by their
// own router rather than falling through the staff one first. Both would
// work today; the order removes the question.
router.use('/auth/traveller', travellerAuthRoutes);
router.use('/auth/operator', operatorAuthRoutes);
router.use('/auth', authRoutes);

router.use('/users', userRoutes);
router.use('/destinations', destinationRoutes);
router.use('/travellers', travellerRoutes);
router.use('/bookings', bookingRoutes);
router.use('/operators', operatorRoutes);
router.use('/payments', paymentRoutes);
router.use('/tasks', taskRoutes);
router.use('/notifications', notificationRoutes);
router.use('/email-logs', emailLogRoutes);

// Reads across every module above. Mounted last of the staff routes because
// that is what it is: a view over the others, owning no data of its own.
router.use('/reports', reportRoutes);

// Traveller-facing. `/me` is the traveller's own record — the id comes from the
// session, never from the URL. `/safety` serves both audiences on separate paths.
router.use('/me', meRoutes);
router.use('/safety', safetyRoutes);

// Operator-facing self-service, parallel to `/me` — singular and distinct
// from the staff `/operators` collection above, so there is no ambiguity
// about which audience a request belongs to.
router.use('/operator', operatorPortalRoutes);

// Unauthenticated, on purpose: this is the only way in for TrailAsia Book,
// the public booking site, which has no staff or traveller session at all.
// See public.routes.js for what that surface deliberately does and does not
// expose.
router.use('/public', publicRoutes);

// Modules to come: /fair-price, /alerts, /chat

module.exports = router;
