'use strict';

const express = require('express');

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const destinationRoutes = require('./destination.routes');
const travellerRoutes = require('./traveller.routes');
const bookingRoutes = require('./booking.routes');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', uptime: process.uptime() } });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/destinations', destinationRoutes);
router.use('/travellers', travellerRoutes);
router.use('/bookings', bookingRoutes);

// Modules to come: /operators, /payments, /tasks, /reports,
// /safety, /fair-price, /alerts, /chat

module.exports = router;
